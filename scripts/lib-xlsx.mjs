// 依存なしの最小限の xlsx 読み取り (unzip 済みのディレクトリから 1 シートを行の配列にする)。
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export async function readSheet(dir, sheet = 'sheet1') {
  const sst = await readFile(join(dir, 'xl', 'sharedStrings.xml'), 'utf8');
  const strings = [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const xml = await readFile(join(dir, 'xl', 'worksheets', `${sheet}.xml`), 'utf8');
  const rows = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, attrs, inner = ''] = c;
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const isText = /t="s"/.test(attrs);
      const inline = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      row[col] = isText && v !== undefined ? strings[Number(v)] : inline !== undefined ? decode(inline) : v !== undefined ? decode(v) : '';
    }
    rows.push(row);
  }
  return rows;
}
