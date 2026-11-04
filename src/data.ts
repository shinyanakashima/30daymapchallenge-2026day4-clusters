import type { Categories, GroupKey, Manifest, Resource } from './types';

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
    throw new Error(`${path} を読み込めませんでした（ネットワークに接続できません）`);
  }
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（HTTP ${res.status}）`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`${path} の形式が正しくありません`);
  }
}

interface RawFeature {
  geometry: { coordinates: [number, number] };
  properties: Omit<Resource, 'lon' | 'lat' | 'group'>;
}

export async function loadData(): Promise<LoadedData> {
  const [gj, categories, manifest] = await Promise.all([
    getJson<{ features: RawFeature[] }>('data/resources.geojson'),
    getJson<Categories>('data/categories.json'),
    getJson<Manifest>('data/manifest.json'),
  ]);
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
    throw new Error(`地点数が manifest と一致しません（${resources.length} / ${manifest.stats.validPoints}）`);
  }
  return { resources, categories, manifest };
}
