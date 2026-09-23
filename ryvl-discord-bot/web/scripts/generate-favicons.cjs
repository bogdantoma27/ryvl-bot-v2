'use strict';
// Generate committed favicon assets from the existing RYVL artwork. No logo redesign.
// Uses the backend's existing Sharp dependency; the web app adds no image library.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../server/node_modules/sharp');
const publicDir = path.resolve(__dirname, '../public');
async function main() {
  const source = await sharp(path.join(publicDir, 'assets/branding/ryvl-mark.png')).trim().png().toBuffer();
  async function icon(size) {
    const padding = Math.max(1, Math.round(size / 16));
    const mark = await sharp(source).resize(size - padding * 2, size - padding * 2, { fit: 'inside' }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: '#080808' } })
      .composite([{ input: mark, gravity: 'centre' }]).png().toBuffer();
  }
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(icon));
  // ICO permits PNG image payloads. The directory retains real 16/32/48px entries.
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory[entry] = sizes[index]; directory[entry + 1] = sizes[index];
    directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.length, entry + 8); directory.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await fs.writeFile(path.join(publicDir, 'favicon.ico'), Buffer.concat([directory, ...images]));
  await fs.writeFile(path.join(publicDir, 'ryvl-favicon-32.png'), images[1]);
  await fs.writeFile(path.join(publicDir, 'ryvl-apple-touch-icon.png'), await icon(180));
  console.log('Generated RYVL favicons from existing artwork: ICO 16/32/48, PNG 32, touch icon 180.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
