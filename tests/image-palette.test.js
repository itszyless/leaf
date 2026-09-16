const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { paletteFromBuffer, extractColors, colorPages, paletteLimit, downloadImage, swatchBuffer, MAX_BYTES } = require('../utils/imagePalette');

function pixels(bands) {
  return Buffer.from(bands.flatMap(([rgb, count, alpha = 255]) => Array.from({ length: count }, () => [...rgb, alpha]).flat()));
}
test('solid colours and transparent pixels do not create artificial palette entries', () => {
  const colors = extractColors(pixels([[[255, 0, 0], 50], [[0, 0, 255], 200, 0]]));
  assert.equal(colors.length, 1);
  assert.equal(colors[0].hex, '#FF0000');
  assert.equal(colors[0].percentage, 100);
  assert.throws(() => extractColors(pixels([[[255, 0, 0], 10, 0]])), /transparent/);
});
test('important colours are ranked by area; very similar shades and tiny noise are removed', () => {
  const colors = extractColors(pixels([[[255, 0, 0], 600], [[0, 255, 0], 300], [[0, 0, 255], 100], [[100, 100, 100], 1]]));
  assert.equal(colors.length, 3);
  assert.deepEqual(colors.map(c => c.hex), ['#FF0000', '#00FF00', '#0000FF']);
  assert.ok(Math.abs(colors[0].percentage - 60) < 1);
  assert.equal(extractColors(pixels([[[200, 20, 20], 50], [[205, 22, 22], 50]])).length, 1);
});
test('free and Plus limits produce at most three and six pages, with five HEX colours per page', () => {
  const bands = [];
  for (const r of [0, 85, 170, 255]) for (const g of [0, 85, 170, 255]) for (const b of [0, 85, 170, 255]) bands.push([[r, g, b], 10]);
  const free = extractColors(pixels(bands), paletteLimit(false));
  const plus = extractColors(pixels(bands), paletteLimit(true));
  assert.equal(free.length, 15);
  assert.equal(plus.length, 30);
  assert.deepEqual(free, plus.slice(0, 15));
  assert.equal(colorPages(free).length, 3);
  assert.equal(colorPages(plus).length, 6);
  assert.ok(colorPages(plus).every(page => page.length === 5));
  assert.equal(new Set(plus.map(c => c.hex)).size, 30);
});
test('real PNG, JPEG, WebP, GIF and AVIF buffers decode into usable colours and swatch images', async () => {
  for (const format of ['png', 'jpeg', 'webp', 'gif', 'avif']) {
    const image = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#FF0000' } }).toFormat(format).toBuffer();
    const { colors } = await paletteFromBuffer(image);
    assert.equal(colors.length, 1, format);
    assert.ok(colors[0].rgb[0] > 240 && colors[0].rgb[1] < 12 && colors[0].rgb[2] < 12, format);
    const swatch = await swatchBuffer(colors);
    const metadata = await sharp(swatch).metadata();
    assert.equal(metadata.width, 160);
    assert.equal(metadata.height, 100);
    assert.equal(metadata.format, 'png');
  }
});
test('invalid files, excessive dimensions, unsupported SVG and oversized buffers fail cleanly', async () => {
  await assert.rejects(paletteFromBuffer(Buffer.from('not an image')), /Could not read/);
  await assert.rejects(paletteFromBuffer(Buffer.alloc(MAX_BYTES + 1)), /10 MB/);
  await assert.rejects(paletteFromBuffer(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')), /Use PNG/);
  const large = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: '#000' } }).png().toBuffer();
  await assert.rejects(paletteFromBuffer(large), /25 megapixels/);
});
test('attachment download requires a Discord attachment and enforces actual byte limits', async t => {
  await assert.rejects(downloadImage({ url: 'http://localhost/file.png', size: 10 }), /attach/);
  await assert.rejects(downloadImage({ url: 'https://cdn.discordapp.com.evil.test/attachments/1/a.png', size: 10 }), /attach/);
  t.mock.method(globalThis, 'fetch', async () => new Response(Buffer.from('image bytes')));
  const attachment = { url: 'https://cdn.discordapp.com/attachments/1/2/test.png', size: 11 };
  assert.equal((await downloadImage(attachment)).toString(), 'image bytes');
  t.mock.method(globalThis, 'fetch', async () => new Response(Buffer.alloc(MAX_BYTES + 1)));
  await assert.rejects(downloadImage(attachment), /10 MB/);
});
