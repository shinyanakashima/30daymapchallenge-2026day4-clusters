// 点シェープファイルと dbf の最小限の読み取り (依存なし)。
// ---- shapefile (点) ----
export function readPointShp(buf) {
  const shapeType = buf.readInt32LE(32);
  if (shapeType !== 1) throw new Error(`P12a is not Point shapefile (type ${shapeType})`);
  const fileLen = buf.readInt32BE(24) * 2;
  const pts = [];
  let o = 100;
  while (o < fileLen) {
    const contentLen = buf.readInt32BE(o + 4) * 2;
    const type = buf.readInt32LE(o + 8);
    if (type === 0) pts.push(null);
    else if (type === 1) pts.push([buf.readDoubleLE(o + 12), buf.readDoubleLE(o + 20)]);
    else throw new Error(`unexpected record type ${type}`);
    o += 8 + contentLen;
  }
  return pts;
}

// ---- dbf ----
export function readDbf(buf, encoding) {
  const n = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recLen = buf.readUInt16LE(10);
  const fields = [];
  for (let i = 32; buf[i] !== 0x0d; i += 32) {
    fields.push({
      name: buf.subarray(i, i + 11).toString('latin1').replace(/\0.*$/s, ''),
      type: String.fromCharCode(buf[i + 11]),
      len: buf[i + 16],
    });
  }
  const dec = new TextDecoder(encoding);
  const rows = [];
  for (let r = 0; r < n; r++) {
    const base = headerLen + r * recLen;
    const deleted = buf[base] === 0x2a;
    let o = base + 1;
    const row = {};
    for (const f of fields) {
      const raw = dec.decode(buf.subarray(o, o + f.len)).trim();
      row[f.name] = f.type === 'N' ? (raw === '' ? null : Number(raw)) : raw;
      o += f.len;
    }
    rows.push({ deleted, row });
  }
  return { fields, rows };
}

