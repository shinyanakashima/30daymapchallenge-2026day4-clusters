// 国土数値情報のデータを data/raw/ に取得・展開する。展開には unzip コマンドを使う。
//  - 観光資源 第2.2版 北海道 (P12-14_01)
//  - 道の駅 平成30年 全国 (P35-18)
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const FILES = [
  'https://nlftp.mlit.go.jp/ksj/gml/data/P12/P12-14/P12-14_01_GML.zip',
  'https://nlftp.mlit.go.jp/ksj/gml/data/P35/P35-18/P35-18_GML.zip',
];
const dir = join(process.cwd(), 'data', 'raw');
await mkdir(dir, { recursive: true });
for (const url of FILES) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zipPath = join(dir, url.split('/').pop());
  await writeFile(zipPath, buf);
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', dir]);
  console.log(`saved ${buf.length} bytes -> ${zipPath}`);
}
await writeFile(join(dir, 'fetched_at.txt'), new Date().toISOString().slice(0, 10) + '\n');
