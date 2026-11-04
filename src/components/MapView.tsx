import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PALETTE } from '../lib/colors';
import type { Computed, Group } from '../model';
import type { MapPos, Resource, ViewMode } from '../types';
import { BLOB_THRESHOLD, blobRadiusKm, heatmapRadiusExpr, hexToRgba, metersPerPixel } from '../blob';
import { baseStyle, DATA_ATTRIBUTION, HOKKAIDO_BOUNDS, INK, MAP_BG, NOISE_FILL, NOISE_STROKE, PLAIN_POINT, ROAD_LAYER_IDS } from '../mapStyle';

interface Props {
  resources: Resource[];
  computed: Computed | null;
  view: ViewMode;
  selectedId: number | null;
  selectedGroup: Group | null;
  epsKm: number;
  showRoads: boolean;
  showEki: boolean;
  initialPos: MapPos | null;
  padding: { top: number; right: number; bottom: number; left: number };
  onSelect: (id: number | null) => void;
  onCandidates: (ids: number[]) => void;
  onMove: (pos: MapPos) => void;
  onReady: (map: MLMap) => void;
  onError: (message: string | null) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** 地点の属性をポップアップ用の DOM にする (名称は利用者データもあるので textContent で入れる)。 */
function popupContent(r: Resource, group: Group | undefined, view: ViewMode, inTarget: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pt-popup';
  const add = (tag: string, cls: string, text: string, color?: string) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (color) {
      const sw = document.createElement('i');
      sw.className = 'pt-popup-swatch';
      sw.style.background = color;
      e.appendChild(sw);
    }
    e.appendChild(document.createTextNode(text));
    el.appendChild(e);
  };
  add('p', 'pt-popup-name', r.name);
  add('p', 'pt-popup-meta', [r.kind, r.address || r.municipalities.map((m) => m.name ?? m.code).join('・')].filter(Boolean).join('／'));
  if (!inTarget) add('p', 'pt-popup-cluster', 'いまのテーマの対象外');
  else if (view === 'clusters') {
    if (group) add('p', 'pt-popup-cluster', `${group.label} のまとまり（${group.members.length} 地点）`, PALETTE[group.color]);
    else add('p', 'pt-popup-cluster', '孤立点（どのまとまりにも入っていません）');
  }
  return el;
}

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const loaded = useRef(false);
  const markers = useRef<maplibregl.Marker[]>([]);
  const hoverPopup = useRef<maplibregl.Popup | null>(null);
  const pinnedPopup = useRef<{ popup: maplibregl.Popup; id: number } | null>(null);
  const cb = useRef(props);
  const pinRef = useRef<(id: number | null) => void>(() => {});
  cb.current = props;

  // 初期化 (1 回だけ)
  useEffect(() => {
    if (!container.current) return;
    const p = cb.current;
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle,
      bounds: p.initialPos ? undefined : HOKKAIDO_BOUNDS,
      center: p.initialPos ? [p.initialPos.lon, p.initialPos.lat] : undefined,
      zoom: p.initialPos?.zoom,
      fitBoundsOptions: { padding: p.padding },
      minZoom: 4,
      maxZoom: 14,
      attributionControl: false,
      dragRotate: false,
      localIdeographFontFamily: "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', 'Meiryo', sans-serif",
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: DATA_ATTRIBUTION }), 'bottom-left');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;

    let tileErrors = 0;
    map.on('error', (e) => {
      const src = (e as unknown as { sourceId?: string }).sourceId;
      if (src === 'gsi') {
        tileErrors++;
        if (tileErrors >= 6) cb.current.onError('背景地図（地理院タイル）の一部を読み込めませんでした。観光資源の点とまとまりは表示できます。');
      }
    });
    map.on('data', (e) => {
      if ((e as unknown as { sourceId?: string; isSourceLoaded?: boolean }).sourceId === 'gsi' && tileErrors > 0 && map.areTilesLoaded()) {
        tileErrors = 0;
        cb.current.onError(null);
      }
    });

    map.on('load', () => {
      map.addSource('members', { type: 'geojson', data: EMPTY });
      map.addSource('points', { type: 'geojson', data: EMPTY });
      const radius = heatmapRadiusExpr(cb.current.epsKm) as never;
      // 色ごとに heatmap を分け、重なっても 1 つのなめらかなにじみになるようにする
      PALETTE.forEach((hex, i) => {
        map.addLayer({
          id: `blob-${i}`,
          type: 'heatmap',
          source: 'members',
          filter: ['==', ['get', 'color'], i],
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': 1,
            'heatmap-radius': radius,
            // 輪郭線は付けず、縁をぼかした一様な塗りにする
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              BLOB_THRESHOLD * 0.6, hexToRgba(hex, 0),
              BLOB_THRESHOLD * 1.4, hexToRgba(hex, 0.22),
              1, hexToRgba(hex, 0.26),
            ],
          },
        });
      });
      // 選択中のまとまりは、にじみ全体を少し明るくする (色以外の強調)
      map.addLayer({
        id: 'blob-selected',
        type: 'heatmap',
        source: 'members',
        filter: ['==', ['get', 'selected'], 1],
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': 1,
          'heatmap-radius': radius,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            BLOB_THRESHOLD * 0.6, hexToRgba(INK, 0),
            BLOB_THRESHOLD * 1.4, hexToRgba(INK, 0.1),
            1, hexToRgba(INK, 0.1),
          ],
        },
      });
      // 道の駅 (参考レイヤ): ひし形のアイコン
      const size = 14;
      const cv = document.createElement('canvas');
      cv.width = cv.height = size * 2;
      const c2 = cv.getContext('2d')!;
      c2.scale(2, 2);
      c2.beginPath();
      c2.moveTo(size / 2, 1.5);
      c2.lineTo(size - 1.5, size / 2);
      c2.lineTo(size / 2, size - 1.5);
      c2.lineTo(1.5, size / 2);
      c2.closePath();
      c2.fillStyle = '#0a0c11';
      c2.fill();
      c2.lineWidth = 1.6;
      c2.strokeStyle = '#d8d2c6';
      c2.stroke();
      map.addImage('eki', c2.getImageData(0, 0, size * 2, size * 2), { pixelRatio: 2 });
      map.addSource('eki', { type: 'geojson', data: `${import.meta.env.BASE_URL}data/michinoeki.geojson` });
      map.addLayer({
        id: 'eki',
        type: 'symbol',
        source: 'eki',
        layout: {
          'icon-image': 'eki',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.55, 10, 0.9],
          'icon-allow-overlap': true,
          visibility: cb.current.showEki ? 'visible' : 'none',
        },
        paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.45, 9, 0.8] },
      });
      for (const id of ROAD_LAYER_IDS) map.setLayoutProperty(id, 'visibility', cb.current.showRoads ? 'visible' : 'none');
      map.addLayer({
        id: 'pt-dim',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'state'], 'dim'],
        paint: { 'circle-radius': 2.5, 'circle-color': NOISE_STROKE, 'circle-opacity': 0.25 },
      });
      map.addLayer({
        id: 'pt',
        type: 'circle',
        source: 'points',
        filter: ['!=', ['get', 'state'], 'dim'],
        paint: {
          'circle-radius': ['match', ['get', 'state'], 'member', 5, 'noise', 4.5, 4.5],
          'circle-color': ['match', ['get', 'state'], 'noise', NOISE_FILL, ['get', 'color']],
          'circle-stroke-color': ['case', ['==', ['get', 'inSelected'], 1], INK, ['match', ['get', 'state'], 'noise', NOISE_STROKE, MAP_BG]],
          'circle-stroke-width': ['case', ['==', ['get', 'inSelected'], 1], 2, ['match', ['get', 'state'], 'noise', 1.8, 1.4]],
        },
      });
      map.addLayer({
        id: 'pt-selected',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'selected'], 1],
        paint: { 'circle-radius': 10, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': INK, 'circle-stroke-width': 2 },
      });
      loaded.current = true;
      render();
      cb.current.onReady(map);
    });

    map.on('click', (e) => {
      const r = 7;
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - r, e.point.y - r],
        [e.point.x + r, e.point.y + r],
      ];
      const pts = map.queryRenderedFeatures(box, { layers: ['pt'] });
      const ids = [...new Set(pts.map((f: MapGeoJSONFeature) => Number(f.properties.id)))].sort((a, b) => a - b);
      if (ids.length > 1) {
        cb.current.onCandidates(ids);
        return;
      }
      if (ids.length === 1) {
        pinRef.current(ids[0]);
        cb.current.onSelect(ids[0]);
        return;
      }
      pinRef.current(null);
      // にじみの上なら、そのまとまりを選ぶ (heatmap は当たり判定できないので距離で判定)
      const { computed, view, epsKm } = cb.current;
      if (computed && view === 'clusters') {
        const rPx = (blobRadiusKm(epsKm) * 1000) / metersPerPixel(map.getZoom());
        let best: { key: number; d: number } | null = null;
        for (const g of computed.groups) {
          for (const id of g.members) {
            const r = cb.current.resources.find((x) => x.id === id);
            if (!r) continue;
            const q = map.project([r.lon, r.lat]);
            const d = Math.hypot(q.x - e.point.x, q.y - e.point.y);
            if (d <= rPx && (!best || d < best.d)) best = { key: g.key, d };
          }
        }
        if (best) {
          cb.current.onSelect(best.key);
          return;
        }
      }
      cb.current.onSelect(null);
    });
    const showPopup = (id: number, pinned: boolean) => {
      const { resources, computed, view } = cb.current;
      const r = resources.find((x) => x.id === id);
      if (!r) return null;
      const inTarget = computed?.targetIds.includes(id) ?? false;
      const popup = new maplibregl.Popup({
        closeButton: pinned,
        closeOnClick: false,
        offset: 10,
        maxWidth: '260px',
        className: pinned ? 'is-pinned' : '',
      })
        .setLngLat([r.lon, r.lat])
        .setDOMContent(popupContent(r, computed?.groupOf.get(id), view, inTarget))
        .addTo(map);
      return popup;
    };
    map.on('mousemove', 'pt', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f) return;
      const id = Number(f.properties.id);
      if (pinnedPopup.current?.id === id) return;
      hoverPopup.current?.remove();
      hoverPopup.current = showPopup(id, false);
    });
    map.on('mousemove', 'eki', (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ['pt'] }).length) return;
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = 'default';
      hoverPopup.current?.remove();
      const el = document.createElement('div');
      el.className = 'pt-popup';
      const n = document.createElement('p');
      n.className = 'pt-popup-name';
      n.textContent = String(f.properties.name);
      const m = document.createElement('p');
      m.className = 'pt-popup-meta';
      m.textContent = `${f.properties.municipality}／参考：2018年時点の道の駅`;
      el.append(n, m);
      hoverPopup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, maxWidth: '240px' })
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setDOMContent(el)
        .addTo(map);
    });
    map.on('mouseleave', 'eki', () => {
      map.getCanvas().style.cursor = '';
      hoverPopup.current?.remove();
      hoverPopup.current = null;
    });
    map.on('mouseleave', 'pt', () => {
      map.getCanvas().style.cursor = '';
      hoverPopup.current?.remove();
      hoverPopup.current = null;
    });
    // クリック・タップした地点はポップアップを残す (タッチ端末にはホバーがないため)
    pinRef.current = (id: number | null) => {
      pinnedPopup.current?.popup.remove();
      pinnedPopup.current = null;
      hoverPopup.current?.remove();
      hoverPopup.current = null;
      if (id === null) return;
      const popup = showPopup(id, true);
      if (popup) pinnedPopup.current = { popup, id };
    };
    map.on('moveend', () => {
      const c = map.getCenter();
      cb.current.onMove({ lon: c.lng, lat: c.lat, zoom: map.getZoom() });
    });

    return () => {
      markers.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
      loaded.current = false;
    };
  }, []);

  function render() {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    const { resources, computed, view, selectedId, selectedGroup } = cb.current;
    const epsKm = computed?.epsKm ?? cb.current.epsKm;
    const clusters = view === 'clusters';
    const target = new Set(computed?.targetIds ?? []);

    const pointFeatures: GeoJSON.Feature[] = resources.map((r) => {
      const g = computed?.groupOf.get(r.id);
      const state = !target.has(r.id) ? 'dim' : !clusters ? 'plain' : g ? 'member' : 'noise';
      const color = state === 'member' && g ? PALETTE[g.color] : PLAIN_POINT;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: { id: r.id, state, color, selected: r.id === selectedId ? 1 : 0, inSelected: g && g === selectedGroup ? 1 : 0 },
      };
    });
    const memberFeatures: GeoJSON.Feature[] = [];
    if (clusters && computed) {
      for (const g of computed.groups) {
        for (const id of g.members) {
          const r = resources.find((x) => x.id === id);
          if (!r) continue;
          memberFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
            properties: { color: g.color, selected: g === selectedGroup ? 1 : 0 },
          });
        }
      }
    }
    (map.getSource('points') as GeoJSONSource).setData({ type: 'FeatureCollection', features: pointFeatures });
    (map.getSource('members') as GeoJSONSource).setData({ type: 'FeatureCollection', features: memberFeatures });
    const radius = heatmapRadiusExpr(epsKm) as never;
    for (const layer of [...PALETTE.map((_, i) => `blob-${i}`), 'blob-selected']) map.setPaintProperty(layer, 'heatmap-radius', radius);

    // 地点数のバッジ (色以外でもまとまりが読めるように)
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (clusters && computed) {
      for (const g of computed.groups) {
        const el = document.createElement('div');
        el.className = 'count-badge' + (g === selectedGroup ? ' is-selected' : '');
        el.style.setProperty('--c', PALETTE[g.color]);
        el.textContent = String(g.members.length);
        el.setAttribute('aria-hidden', 'true');
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          cb.current.onSelect(g.key);
        });
        markers.current.push(new maplibregl.Marker({ element: el, offset: [0, -16] }).setLngLat(g.centroid).addTo(map));
      }
    }
  }

  useEffect(render, [props.computed, props.view, props.selectedId, props.selectedGroup, props.resources]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    for (const id of ROAD_LAYER_IDS) map.setLayoutProperty(id, 'visibility', props.showRoads ? 'visible' : 'none');
    map.setLayoutProperty('eki', 'visibility', props.showEki ? 'visible' : 'none');
  }, [props.showRoads, props.showEki]);
  // 再計算や選択解除に合わせて、残したポップアップを更新・閉じる
  useEffect(() => {
    const pinned = pinnedPopup.current;
    if (!pinned) return;
    if (props.selectedId !== pinned.id) pinRef.current(null);
    else pinRef.current(pinned.id);
  }, [props.computed, props.view, props.selectedId]);

  return <div ref={container} className="map" role="region" aria-label="北海道の観光資源とまとまりの地図" />;
}
