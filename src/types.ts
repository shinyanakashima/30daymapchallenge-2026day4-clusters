export type GroupKey = 'nature' | 'culture' | 'unclassified' | 'user';

export interface Municipality {
  code: string;
  name: string | null;
}

export interface Resource {
  id: number;
  name: string;
  kind: string;
  kindKey: string;
  group: GroupKey;
  address: string;
  municipalities: Municipality[];
  lon: number;
  lat: number;
}

export interface KindDef {
  key: string;
  name: string;
  group: GroupKey;
  count: number;
}

export interface Categories {
  note: string;
  groups: { key: GroupKey; label: string }[];
  kinds: KindDef[];
}

export interface Manifest {
  edition?: Edition;
  source: {
    name: string;
    publisher: string;
    pageUrl: string;
    downloadUrl: string;
    referenceDate: string;
    fetchedAt: string | null;
    license: string;
    licenseUrl: string;
  };
  stats: { validPoints: number; totalRecords: number };
  notes: string[];
}

/** カテゴリ指定: すべて / 大分類 / 種別キーの集合 */
export type CategorySel =
  | { type: 'all' }
  | { type: 'group'; group: GroupKey }
  | { type: 'kinds'; keys: string[] };

export type ViewMode = 'clusters' | 'points';

export interface MapPos {
  lon: number;
  lat: number;
  zoom: number;
}

export type Edition = '2014' | '2010';

export interface AppSettings {
  /** 観光資源データの版 */
  edition: Edition;
  epsKm: number;
  minPts: number;
  cat: CategorySel;
  /** 選択している資源 ID。グループはこの資源を含むものとして復元する。 */
  sel: number | null;
  view: ViewMode;
  map: MapPos | null;
  title: string;
  /** 重ねて表示する参考レイヤ */
  showRoads: boolean;
  showEki: boolean;
  showAirports: boolean;
  showRail: boolean;
  /** 廃止された路線も薄く重ねる */
  showRailHistory: boolean;
  /** 背景地図の昼・夜 */
  theme: 'day' | 'night';
}
