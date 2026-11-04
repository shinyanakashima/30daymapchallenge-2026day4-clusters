import type { Categories, Edition, GroupKey, Manifest, Resource } from './types';

export interface LoadedData {
  resources: Resource[];
  categories: Categories;
  manifest: Manifest;
}

const base = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`);
  } catch {
    throw new Error(`Could not load ${path} (network error) / ${path} を読み込めませんでした（ネットワークに接続できません）`);
  }
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status}) / ${path} を読み込めませんでした（HTTP ${res.status}）`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`${path} has an invalid format / ${path} の形式が正しくありません`);
  }
}

interface RawFeature {
  geometry: { coordinates: [number, number] };
  properties: Omit<Resource, 'lon' | 'lat' | 'group'>;
}

export async function loadData(edition: Edition = '2014'): Promise<LoadedData> {
  const suffix = edition === '2014' ? '' : `-${edition}`;
  const [gj, categories, manifest] = await Promise.all([
    getJson<{ features: RawFeature[] }>(`data/resources${suffix}.geojson`),
    getJson<Categories>(`data/categories${suffix}.json`),
    getJson<Manifest>(`data/manifest${suffix}.json`),
  ]);
  manifest.edition = edition;
  const groupOf = new Map<string, GroupKey>(categories.kinds.map((k) => [k.key, k.group]));
  const resources = gj.features
    .map((f) => ({
      ...f.properties,
      group: groupOf.get(f.properties.kindKey) ?? 'unclassified',
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }))
    .sort((a, b) => a.id - b.id);
  if (resources.length !== manifest.stats.validPoints) {
    throw new Error(`Spot count does not match the manifest (${resources.length} / ${manifest.stats.validPoints}) / 地点数が manifest と一致しません`);
  }
  return { resources, categories, manifest };
}
