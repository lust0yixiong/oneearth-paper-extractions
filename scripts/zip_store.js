// Small ZIP writer using the "store" method so it works without a third-party service.
window.makePaperImportZip = entries => {
  const encoder = new TextEncoder();
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  const crc32 = bytes => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const put16 = (view, offset, value) => view.setUint16(offset, value, true);
  const put32 = (view, offset, value) => view.setUint32(offset, value, true);
  const now = new Date();
  const date = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const body = [], central = [];
  let offset = 0, centralLength = 0;
  for (const entry of entries) {
    if (!/^[\w./-]+$/.test(entry.path) || entry.path.startsWith('/') || entry.path.includes('..'))
      throw new Error('发布文件路径无效。');
    const name = encoder.encode(entry.path);
    const data = entry.bytes;
    if (!ArrayBuffer.isView(data) || data.BYTES_PER_ELEMENT !== 1 || data.length > 0xffffffff)
      throw new Error('发布文件过大。');
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    put32(lv, 0, 0x04034b50);
    put16(lv, 4, 20);
    put16(lv, 6, 0x0800);
    put16(lv, 8, 0);
    put16(lv, 10, time);
    put16(lv, 12, date);
    put32(lv, 14, crc);
    put32(lv, 18, data.length);
    put32(lv, 22, data.length);
    put16(lv, 26, name.length);
    local.set(name, 30);
    body.push(local, data);

    const header = new Uint8Array(46 + name.length);
    const cv = new DataView(header.buffer);
    put32(cv, 0, 0x02014b50);
    put16(cv, 4, 20);
    put16(cv, 6, 20);
    put16(cv, 8, 0x0800);
    put16(cv, 10, 0);
    put16(cv, 12, time);
    put16(cv, 14, date);
    put32(cv, 16, crc);
    put32(cv, 20, data.length);
    put32(cv, 24, data.length);
    put16(cv, 28, name.length);
    put32(cv, 42, offset);
    header.set(name, 46);
    central.push(header);
    centralLength += header.length;
    offset += local.length + data.length;
  }
  if (entries.length > 65535 || offset > 0xffffffff) throw new Error('发布包过大。');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  put32(ev, 0, 0x06054b50);
  put16(ev, 8, entries.length);
  put16(ev, 10, entries.length);
  put32(ev, 12, centralLength);
  put32(ev, 16, offset);
  return new Blob([...body, ...central, end], {type: 'application/zip'});
};
