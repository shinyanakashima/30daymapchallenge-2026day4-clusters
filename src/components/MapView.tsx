import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PALETTE, setPalette } from '../lib/colors';
import type { Computed, Group } from '../model';
import type { MapPos, Resource, ViewMode } from '../types';
import { BLOB_THRESHOLD, blobRadiusKm, heatmapRadiusExpr, hexToRgba, metersPerPixel } from '../blob';
import { applyBaseTheme, buildBaseStyle, DATA_ATTRIBUTION, HOKKAIDO_BOUNDS, ROAD_LAYER_IDS, THEMES, type MapTheme, type MapThemeName } from '../mapStyle';

interface Props {
  resources: Resource[];
  computed: Computed | null;
  view: ViewMode;
  selectedId: number | null;
  selectedGroup: Group | null;
  epsKm: number;
  showRoads: boolean;
  showEki: boolean;
  showAirports: boolean;
  showRail: boolean;
  showRailHistory: boolean;
  theme: MapThemeName;
  initialPos: MapPos | null;
  padding: { top: number; right: number; bottom: number; left: number };
  onSelect: (id: number | null) => void;
  onCandidates: (ids: number[]) => void;
  onMove: (pos: MapPos) => void;
  onReady: (map: MLMap) => void;
  onError: (message: string | null) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const AIRPORT_LAYERS = ['airport-halo', 'airport-glow', 'airport'];

function blobColor(hex: string, alpha: number) {
  return [
    'interpolate', ['linear'], ['heatmap-density'],
    0, 'rgba(0,0,0,0)',
    BLOB_THRESHOLD * 0.6, hexToRgba(hex, 0),
    BLOB_THRESHOLD * 1.4, hexToRgba(hex, alpha),
    1, hexToRgba(hex, alpha + 0.04),
  ];
}

function strokeExpr(t: MapTheme) {
  return ['case', ['==', ['get', 'inSelected'], 1], t.ink, ['match', ['get', 'state'], 'noise', t.noiseStroke, t.memberStroke]] as never;
}

/** 道の駅のひし形アイコン */
function ekiImage(t: MapTheme): ImageData {
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
  c2.fillStyle = t.ekiFill;
  c2.fill();
  c2.lineWidth = 1.6;
  c2.strokeStyle = t.ekiStroke;
  c2.stroke();
  return c2.getImageData(0, 0, size * 2, size * 2);
}

const RAIL_LAYERS = ['rail-glow', 'rail', 'rail-dash', 'station'];

/** 鉄道 (現在の路線・廃止区間・駅)。地名ラベルの下に入れる。 */
function addRailLayers(map: MLMap, t: MapTheme, show: boolean, showHistory: boolean) {
  const base = import.meta.env.BASE_URL;
  const vis = show ? 'visible' : 'none';
  map.addSource('rail', { type: 'geojson', data: `${base}data/rail.geojson` });
  map.addSource('rail-history', { type: 'geojson', data: `${base}data/rail-history.geojson` });
  map.addSource('stations', { type: 'geojson', data: `${base}data/stations.geojson` });
  const width = (k: number) => ['interpolate', ['linear'], ['zoom'], 5, ['case', ['==', ['get', 'cls'], 'shinkansen'], 2 * k, 1.3 * k], 12, ['case', ['==', ['get', 'cls'], 'shinkansen'], 5 * k, 3 * k]];
  map.addLayer(
    {
      id: 'rail-history',
      type: 'line',
      source: 'rail-history',
      layout: { visibility: showHistory ? 'visible' : 'none', 'line-join': 'round' },
      paint: { 'line-color': t.railHistory, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 12, 1.6], 'line-dasharray': [2, 2], 'line-opacity': 0.7 },
    },
    'place-label',
  );
  map.addLayer(
    {
      id: 'rail-glow',
      type: 'line',
      source: 'rail',
      layout: { visibility: vis, 'line-join': 'round' },
      paint: { 'line-color': t.rail, 'line-width': width(4) as never, 'line-blur': 4, 'line-opacity': t.railGlowOpacity },
    },
    'place-label',
  );
  map.addLayer(
    {
      id: 'rail',
      type: 'line',
      source: 'rail',
      layout: { visibility: vis, 'line-join': 'round' },
      paint: { 'line-color': t.rail, 'line-width': width(1) as never, 'line-opacity': 0.9 },
    },
    'place-label',
  );
  map.addLayer(
    {
      id: 'rail-dash',
      type: 'line',
      source: 'rail',
      minzoom: 7,
      layout: { visibility: vis },
      paint: { 'line-color': t.railDash, 'line-width': width(0.45) as never, 'line-dasharray': [3, 3] },
    },
    'place-label',
  );
  map.addLayer(
    {
      id: 'station',
      type: 'circle',
      source: 'stations',
      minzoom: 7,
      layout: { visibility: vis },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, ['case', ['==', ['get', 'major'], 1], 2.6, 1.8], 12, ['case', ['==', ['get', 'major'], 1], 5, 3.6]],
        'circle-color': t.stationFill,
        'circle-stroke-color': t.stationStroke,
        'circle-stroke-width': 1.2,
      },
    },
    'place-label',
  );
}

/** データ側レイヤの配色を昼・夜で塗り直す。 */
function applyDataTheme(map: MLMap, t: MapTheme) {
  setPalette(t.palette);
  pulseStrength = t.airportGlow;
  map.setPaintProperty('airport-glow', 'circle-opacity', 0.5 * t.airportGlow);
  t.palette.forEach((hex, i) => map.setPaintProperty(`blob-${i}`, 'heatmap-color', blobColor(hex, t.blobAlpha)));
  map.setPaintProperty('blob-selected', 'heatmap-color', [
    'interpolate', ['linear'], ['heatmap-density'],
    0, 'rgba(0,0,0,0)', BLOB_THRESHOLD * 0.6, 'rgba(0,0,0,0)', BLOB_THRESHOLD * 1.4, t.selectedOverlay, 1, t.selectedOverlay,
  ]);
  map.updateImage('eki', ekiImage(t));
  map.setPaintProperty('airport-halo', 'circle-color', t.airport);
  map.setPaintProperty('airport-glow', 'circle-color', t.airport);
  const inService = ['==', ['get', 'status'], '供用中'];
  map.setPaintProperty('airport', 'circle-color', ['case', inService, t.airportCore, t.noiseFill]);
  map.setPaintProperty('airport', 'circle-stroke-color', ['case', inService, t.airport, t.noiseStroke]);
  map.setPaintProperty('pt-dim', 'circle-color', t.noiseStroke);
  map.setPaintProperty('pt', 'circle-color', ['match', ['get', 'state'], 'noise', t.noiseFill, ['get', 'color']]);
  map.setPaintProperty('pt', 'circle-stroke-color', strokeExpr(t));
  map.setPaintProperty('pt-selected', 'circle-stroke-color', t.ink);
  map.setPaintProperty('rail-history', 'line-color', t.railHistory);
  map.setPaintProperty('rail-glow', 'line-color', t.rail);
  map.setPaintProperty('rail-glow', 'line-opacity', t.railGlowOpacity);
  map.setPaintProperty('rail', 'line-color', t.rail);
  map.setPaintProperty('rail-dash', 'line-color', t.railDash);
  map.setPaintProperty('station', 'circle-color', t.stationFill);
  map.setPaintProperty('station', 'circle-stroke-color', t.stationStroke);
}

// 空港の光をゆっくり明滅させる。動きを減らす設定では止めたまま (静かな光) にする。
let pulseFrame = 0;
let pulseStrength = 1; // 昼は背景が明るいので光を強める
function startPulse(map: MLMap) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now();
  let last = 0;
  const tick = (now: number) => {
    pulseFrame = requestAnimationFrame(tick);
    if (now - last < 50) return; // 約 20fps で十分
    last = now;
    const k = (Math.sin(((now - t0) / 2600) * Math.PI * 2) + 1) / 2;
    if (!map.getLayer('airport-halo')) return;
    map.setPaintProperty('airport-halo', 'circle-radius', 13 + 9 * k);
    map.setPaintProperty('airport-halo', 'circle-opacity', (0.28 - 0.14 * k) * pulseStrength);
  };
  pulseFrame = requestAnimationFrame(tick);
}
function stopPulse() {
  cancelAnimationFrame(pulseFrame);
}

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
    const T = THEMES[p.theme];
    setPalette(T.palette);
    pulseStrength = T.airportGlow;
    const map = new maplibregl.Map({
      container: container.current,
      style: buildBaseStyle(T),
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
    // スマホでは出典を折りたたむ (全文は「この地図とデータについて」にもある)
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    map.addControl(new maplibregl.AttributionControl({ compact: narrow, customAttribution: DATA_ATTRIBUTION }), 'bottom-left');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;

    let tileErrors = 0;
    map.on('error', (e) => {
      const src = (e as unknown as { sourceId?: string }).sourceId;
      if (src === 'gsi' || src === 'dem' || src === 's2' || src === 'photo') {
        tileErrors++;
        if (tileErrors >= 6) cb.current.onError('背景地図の一部を読み込めませんでした。観光資源の点とまとまりは表示できます。');
      }
    });
    map.on('data', (e) => {
      if ((e as unknown as { sourceId?: string; isSourceLoaded?: boolean }).sourceId === 'gsi' && tileErrors > 0 && map.areTilesLoaded()) {
        tileErrors = 0;
        cb.current.onError(null);
      }
    });

    // データのレイヤは地図の設定が読めた時点で載せる (背景タイルの読み込みを待たない)
    const onStyleReady = () => {
      addRailLayers(map, T, cb.current.showRail, cb.current.showRailHistory);
      map.addSource('members', { type: 'geojson', data: EMPTY });
      map.addSource('points', { type: 'geojson', data: EMPTY });
      const radius = heatmapRadiusExpr(cb.current.epsKm) as never;
      // 色ごとに heatmap を分け、重なっても 1 つのなめらかなにじみになるようにする
      [...PALETTE].forEach((hex, i) => {
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
            'heatmap-color': blobColor(hex, T.blobAlpha) as never,
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
            BLOB_THRESHOLD * 0.6, 'rgba(0,0,0,0)',
            BLOB_THRESHOLD * 1.4, T.selectedOverlay,
            1, T.selectedOverlay,
          ],
        },
      });
      // 道の駅 (参考レイヤ): ひし形のアイコン
      map.addImage('eki', ekiImage(T), { pixelRatio: 2 });
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

      // 空港 (参考レイヤ): 供用中の空港をやわらかく光らせる
      map.addSource('airports', { type: 'geojson', data: `${import.meta.env.BASE_URL}data/airports.geojson` });
      const apVis = cb.current.showAirports ? 'visible' : 'none';
      const inService = ['==', ['get', 'status'], '供用中'] as never;
      map.addLayer({
        id: 'airport-halo',
        type: 'circle',
        source: 'airports',
        filter: inService,
        layout: { visibility: apVis },
        paint: { 'circle-radius': 16, 'circle-color': T.airport, 'circle-opacity': 0.22, 'circle-blur': 1 },
      });
      map.addLayer({
        id: 'airport-glow',
        type: 'circle',
        source: 'airports',
        filter: inService,
        layout: { visibility: apVis },
        paint: { 'circle-radius': 7, 'circle-color': T.airport, 'circle-opacity': Math.min(1, 0.5 * T.airportGlow), 'circle-blur': 0.8 },
      });
      map.addLayer({
        id: 'airport',
        type: 'circle',
        source: 'airports',
        layout: { visibility: apVis },
        paint: {
          'circle-radius': 3.6,
          'circle-color': ['case', inService, T.airportCore, T.noiseFill],
          'circle-stroke-color': ['case', inService, T.airport, T.noiseStroke],
          'circle-stroke-width': ['case', inService, 1, 1.4],
        },
      });
      startPulse(map);

      map.addLayer({
        id: 'pt-dim',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'state'], 'dim'],
        paint: { 'circle-radius': 2.5, 'circle-color': T.noiseStroke, 'circle-opacity': 0.25 },
      });
      map.addLayer({
        id: 'pt',
        type: 'circle',
        source: 'points',
        filter: ['!=', ['get', 'state'], 'dim'],
        paint: {
          'circle-radius': ['match', ['get', 'state'], 'member', 5, 'noise', 4.5, 4.5],
          'circle-color': ['match', ['get', 'state'], 'noise', T.noiseFill, ['get', 'color']],
          'circle-stroke-color': strokeExpr(T),
          'circle-stroke-width': ['case', ['==', ['get', 'inSelected'], 1], 2, ['match', ['get', 'state'], 'noise', 1.8, 1.4]],
        },
      });
      map.addLayer({
        id: 'pt-selected',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'selected'], 1],
        paint: { 'circle-radius': 10, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': T.ink, 'circle-stroke-width': 2 },
      });
      loaded.current = true;
      render();
      cb.current.onReady(map);
    };
    if (map.isStyleLoaded()) onStyleReady();
    else map.once('style.load', onStyleReady);

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
    map.on('mousemove', 'airport', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      hoverPopup.current?.remove();
      const el = document.createElement('div');
      el.className = 'pt-popup';
      const n = document.createElement('p');
      n.className = 'pt-popup-name';
      n.textContent = String(f.properties.name);
      const m = document.createElement('p');
      m.className = 'pt-popup-meta';
      m.textContent = `空港／${f.properties.status}（2021年時点）`;
      el.append(n, m);
      hoverPopup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: '240px' })
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setDOMContent(el)
        .addTo(map);
    });
    map.on('mousemove', 'station', (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ['pt', 'airport'] }).length) return;
      const f = e.features?.[0];
      if (!f) return;
      hoverPopup.current?.remove();
      const el = document.createElement('div');
      el.className = 'pt-popup';
      const n = document.createElement('p');
      n.className = 'pt-popup-name';
      n.textContent = `${f.properties.name}駅`;
      const m = document.createElement('p');
      m.className = 'pt-popup-meta';
      m.textContent = `${f.properties.lines}（${f.properties.operators}）／2025年末時点`;
      el.append(n, m);
      hoverPopup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, maxWidth: '260px' })
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setDOMContent(el)
        .addTo(map);
    });
    map.on('mouseleave', 'station', () => {
      hoverPopup.current?.remove();
      hoverPopup.current = null;
    });
    map.on('mouseleave', 'airport', () => {
      hoverPopup.current?.remove();
      hoverPopup.current = null;
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
      stopPulse();
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
      const color = state === 'member' && g ? PALETTE[g.color] : THEMES[cb.current.theme].plainPoint;
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
    for (const id of AIRPORT_LAYERS) map.setLayoutProperty(id, 'visibility', props.showAirports ? 'visible' : 'none');
    for (const id of RAIL_LAYERS) map.setLayoutProperty(id, 'visibility', props.showRail ? 'visible' : 'none');
    map.setLayoutProperty('rail-history', 'visibility', props.showRailHistory ? 'visible' : 'none');
  }, [props.showRoads, props.showEki, props.showAirports, props.showRail, props.showRailHistory]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    const t = THEMES[props.theme];
    applyBaseTheme(map, t);
    applyDataTheme(map, t);
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.theme]);
  // 再計算や選択解除に合わせて、残したポップアップを更新・閉じる
  useEffect(() => {
    const pinned = pinnedPopup.current;
    if (!pinned) return;
    if (props.selectedId !== pinned.id) pinRef.current(null);
    else pinRef.current(pinned.id);
  }, [props.computed, props.view, props.selectedId]);

  return <div ref={container} className="map" role="region" aria-label="北海道の観光資源とまとまりの地図" />;
}
