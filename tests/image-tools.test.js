const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const { processImage, regions } = require('../utils/imageTools');
const make = (colour, width = 120, height = 80) => sharp({ create: { width, height, channels: 4, background: colour } }).png().toBuffer();
test('sticker outline expands outside the subject without losing transparency', async t => {
  const models = require('../utils/imageModels');
  const subject = await sharp({ create: { width: 80, height: 60, channels: 4, background: '#00000000' } }).composite([{ input: await make('#ff0000', 20, 20), left: 30, top: 20 }]).png().toBuffer();
  t.mock.method(models, 'removeBackground', async () => subject);
  const result = await processImage('sticker', [subject], { border: 4 });
  const { data, info } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  assert.deepEqual(pixel(32, 30), [255, 255, 255, 255]);
  assert.deepEqual(pixel(40, 30), [255, 0, 0, 255]);
  assert.equal(pixel(0, 0)[3], 0);
});
test('resize, crop, conversions and compression produce valid files', async () => {
  const input = await make('#ff0000');
  const resized = await processImage('resize', [input], { width: 60, height: 60 });
  const size = await sharp(resized.buffer).metadata(); assert.equal(size.width, 60); assert.equal(size.height, 40);
  const crop = await processImage('crop', [input], { preset: 'square' }); const square = await sharp(crop.buffer).metadata(); assert.equal(square.width, square.height);
  for (const format of ['png', 'jpeg', 'webp']) { const result = await processImage('convert', [input], { format }); assert.equal((await sharp(result.buffer).metadata()).format, format); }
  const compressed = await processImage('compress', [input]); assert.match(compressed.note, /Before:.*After:/);
  await assert.rejects(processImage('resize', [input], { width: 2000 }), /1536/);
  assert.equal((await sharp((await processImage('resize', [input], { width: 2000 }, true)).buffer).metadata()).width, 2000);
});
test('redaction burns opaque pixels and validates original coordinates', async () => {
  const input = await make('#ff000080');
  const result = await processImage('redact', [input], { regions: '10,10,20,20' });
  const { data, info } = await sharp(result.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (15 * info.width + 15) * 4;
  assert.deepEqual([...data.subarray(offset, offset + 4)], [0, 0, 0, 255]);
  assert.equal(data[0], 255); assert.equal((await sharp(result.buffer).metadata()).exif, undefined);
  assert.throws(() => regions('100,0,30,10', 120, 80, 5), /fit inside/);
  assert.throws(() => regions('-1,0,1,1', 120, 80, 5), /must be/);
});
test('gradient endpoints, difference pixels, and drawing output', async () => {
  const black = await make('#000000'), white = await make('#ffffff');
  const gradient = await processImage('duotone', [black], { shadows: '#ff0000', highlights: '#0000ff' });
  assert.deepEqual([...(await sharp(gradient.buffer).removeAlpha().raw().toBuffer()).subarray(0, 3)], [255, 0, 0]);
  const diff = await processImage('compare', [black, black], { mode: 'difference' }); assert.match(diff.note, /0.00%/); assert.equal((await sharp(diff.buffer).raw().toBuffer()).some(v => v !== 0), false);
  const different = await processImage('compare', [black, white], { mode: 'difference' }); assert.match(different.note, /100.00%/);
  for (const name of ['outline', 'polaroid', 'collage', 'compare']) assert.ok((await sharp((await processImage(name, [black, white], { caption: 'Leaf' })).buffer).metadata()).width > 0);
});
test('Plus limits are enforced without locking free tool modes', async () => {
  const image = await make('#aabbcc');
  await assert.rejects(processImage('collage', Array(5).fill(image)), /4 images/);
  await processImage('collage', Array(9).fill(image), {}, true);
  await assert.rejects(processImage('gradient-map', [image], { colours: '#000000,#ff0000,#ffffff' }), /2–2/);
  await processImage('gradient-map', [image], { colours: '#000000,#ff0000,#ffffff' }, true);
  await assert.rejects(processImage('ascii', [image], { columns: 150 }), /100/);
  const ascii = await processImage('ascii', [image], { columns: 150 }, true); assert.equal(ascii.extension, 'txt'); assert.equal(ascii.buffer.toString().split('\n')[0].length, 150);
  await assert.rejects(processImage('extract-text', [image], { language: 'deu' }), /English OCR/);
});
test('local OCR reads actual text pixels', async () => {
  const canvas = createCanvas(800, 180), ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 800, 180); ctx.fillStyle = 'black'; ctx.font = '64px Arial'; ctx.fillText('LEAF IMAGE TEST 123', 20, 110);
  const result = await processImage('extract-text', [canvas.toBuffer('image/png')]);
  assert.match(result.buffer.toString(), /LEAF IMAGE TEST 123/);
});
test('owner gets non-expiring Plus while an empty owner never matches', () => {
  const config = require('../config.json'), access = require('../utils/plusAccess'), before = config.Owner_ID;
  try { config.Owner_ID = '123456789012345678'; assert.equal(access.isPlusActive(config.Owner_ID), true); assert.deepEqual(access.getPlusInfo(config.Owner_ID), { active: true, expiration: null }); config.Owner_ID = ''; assert.equal(access.isPlusActive(''), false); }
  finally { config.Owner_ID = before; }
});
