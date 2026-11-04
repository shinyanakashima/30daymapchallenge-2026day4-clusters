import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PALETTE } from '../lib/colors';
import type { Computed, Group } from '../model';
import type { MapPos, Resource, ViewMode } from '../types';
import { baseStyle, DATA_ATTRIBUTION, HOKKAIDO_BOUNDS, INK, NOISE_STROKE, PAPER, PLAIN_POINT } from '../mapStyle';

interface Props {
  resources: Resource[];
  computed: Computed | null;
  view: ViewMode;
  selectedId: number | null;
  selectedGroup: Group | null;
  initialPos: MapPos | null;
  padding: { top: number; right: number; bottom: number; left: number };
  onSelect: (id: number | null) => void;
  onCandidates: (ids: number[]) => void;
  onMove: (pos: MapPos) => void;
  onReady: (map: MLMap) => void;
  onError: (message: string | null) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const loaded = useRef(false);
  const markers = useRef<maplibregl.Marker[]>([]);
  const cb = useRef(props);
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
      map.addSource('outlines', { type: 'geojson', data: EMPTY });
      map.addSource('points', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'outline-fill',
        type: 'fill',
        source: 'outlines',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.2, 0.1] },
      });
      map.addLayer({
        id: 'outline-halo',
        type: 'line',
        source: 'outlines',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 16, 'line-opacity': ['case', ['==', ['get', 'selected'], 1], 0.24, 0.13] },
      });
      map.addLayer({
        id: 'outline-line',
        type: 'line',
        source: 'outlines',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'selected'], 1], 2.5, 1.2], 'line-opacity': 0.85 },
      });
      map.addLayer({
        id: 'outline-selected',
        type: 'line',
        source: 'outlines',
        filter: ['==', ['get', 'selected'], 1],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': INK, 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-offset': -0.5 },
      });
      map.addLayer({
        id: 'pt-dim',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'state'], 'dim'],
        paint: { 'circle-radius': 2.5, 'circle-color': NOISE_STROKE, 'circle-opacity': 0.3 },
      });
      map.addLayer({
        id: 'pt',
        type: 'circle',
        source: 'points',
        filter: ['!=', ['get', 'state'], 'dim'],
        paint: {
          'circle-radius': ['match', ['get', 'state'], 'member', 5, 'noise', 4.5, 4.5],
          'circle-color': ['match', ['get', 'state'], 'noise', PAPER, ['get', 'color']],
          'circle-stroke-color': ['match', ['get', 'state'], 'noise', NOISE_STROKE, '#ffffff'],
          'circle-stroke-width': ['match', ['get', 'state'], 'noise', 1.8, 1.4],
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
        cb.current.onSelect(ids[0]);
        return;
      }
      const outl = map.queryRenderedFeatures(e.point, { layers: ['outline-fill', 'outline-halo'] });
      if (outl.length) {
        // 小さい群を優先 (重なり時)
        outl.sort((a, b) => Number(a.properties.size) - Number(b.properties.size));
        cb.current.onSelect(Number(outl[0].properties.key));
        return;
      }
      cb.current.onSelect(null);
    });
    const setCursor = (c: string) => () => (map.getCanvas().style.cursor = c);
    for (const layer of ['pt', 'outline-fill', 'outline-halo']) {
      map.on('mouseenter', layer, setCursor('pointer'));
      map.on('mouseleave', layer, setCursor(''));
    }
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
    const clusters = view === 'clusters';
    const target = new Set(computed?.targetIds ?? []);

    const pointFeatures: GeoJSON.Feature[] = resources.map((r) => {
      const g = computed?.groupOf.get(r.id);
      const state = !target.has(r.id) ? 'dim' : !clusters ? 'plain' : g ? 'member' : 'noise';
      const color = state === 'member' && g ? PALETTE[g.color] : PLAIN_POINT;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: { id: r.id, state, color, selected: r.id === selectedId ? 1 : 0 },
      };
    });
    const outlineFeatures: GeoJSON.Feature[] = [];
    if (clusters && computed) {
      for (const g of computed.groups) {
        const props = { key: g.key, color: PALETTE[g.color], selected: g === selectedGroup ? 1 : 0, size: g.members.length };
        if (g.outline.kind === 'polygon') {
          outlineFeatures.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [g.outline.ring] }, properties: props });
        } else if (g.outline.kind === 'line') {
          outlineFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: g.outline.coords }, properties: props });
        }
      }
    }
    (map.getSource('points') as GeoJSONSource).setData({ type: 'FeatureCollection', features: pointFeatures });
    (map.getSource('outlines') as GeoJSONSource).setData({ type: 'FeatureCollection', features: outlineFeatures });

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

  return <div ref={container} className="map" role="region" aria-label="北海道の観光資源とまとまりの地図" />;
}
