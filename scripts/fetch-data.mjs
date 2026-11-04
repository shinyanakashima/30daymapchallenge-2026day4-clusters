// 国土数値情報「観光資源」第2.2版 北海道ファイルを data/raw/ に取得・展開する。
// 展開には unzip コマンドを使う。
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/P12/P12-14/P12-14_01_GML.zip';
const dir = join(process.cwd(), 'data', 'raw');
await mkdir(dir, { recursive: true });
const res = await fetch(URL);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const zipPath = join(dir, 'P12-14_01_GML.zip');
await writeFile(zipPath, buf);
await writeFile(join(dir, 'fetched_at.txt'), new Date().toISOString().slice(0, 10) + '\n');
execFileSync('unzip', ['-o', '-q', zipPath, '-d', dir]);
console.log(`saved ${buf.length} bytes -> ${zipPath}`);
