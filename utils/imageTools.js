const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const models = require('./imageModels');
const limits = plus => ({ dimension: plus ? 3072 : 1536, images: plus ? 9 : 4, columns: plus ? 200 : 100, stops: plus ? 5 : 2, regions: plus ? 20 : 5 });
function hex(value = '#ffffff') { if (!/^#?[0-9a-f]{6}$/i.test(value)) throw new Error('Use a six-digit HEX colour, for example #ffffff.'); return '#' + value.replace('#', '').toLowerCase(); }
async function decode(buffer) {
  const source = sharp(buffer, { limitInputPixels: 25_000_000, pages: 1, failOn: 'warning' });
  const meta = await source.metadata();
  if (!['png', 'jpeg', 'webp', 'gif', 'avif', 'heif'].includes(meta.format)) throw new Error('Use PNG, JPEG, WebP, GIF or AVIF.');
  return source.rotate().toColourspace('srgb').png().toBuffer();
}
const fit = (buffer, dimension) => sharp(buffer).resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
async function gradient(buffer, colours) {
  const stops = colours.map(value => hex(value).slice(1).match(/../g).map(c => parseInt(c, 16)));
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const value = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255 * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(value)), fraction = value - index;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(stops[index][c] * (1 - fraction) + stops[index + 1][c] * fraction);
  }
  return sharp(data, { raw: info }).png().toBuffer();
}
function regions(input, width, height, maximum) {
  const entries = String(input || '').split(';');
  if (entries.length > maximum) throw new Error(`Your plan allows up to ${maximum} redaction regions.`);
  return entries.map(entry => {
    if (!/^\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*$/.test(entry)) throw new Error('Regions must be x,y,width,height separated by semicolons.');
    const [left, top, w, h] = entry.split(',').map(Number);
    if (!w || !h || left + w > width || top + h > height) throw new Error(`Each region must fit inside the oriented original image (${width} × ${height}).`);
    return { left, top, width: w, height: h };
  });
}
async function processImage(name, inputs, options = {}, plus = false) {
  const cap = limits(plus), originalSize = inputs.reduce((sum, b) => sum + b.length, 0);
  if (inputs.length > cap.images) throw new Error(`Free collages support 4 images; Plus supports 9.`);
  const originals = []; for (const input of inputs) originals.push(await decode(input));
  const images = []; for (const input of originals) images.push(await fit(input, cap.dimension));
  let buffer = images[0], extension = 'png', note = 'Animated inputs use their first frame. Output metadata is removed.';
  let { width, height } = await sharp(buffer).metadata();
  if (name === 'background-remove' || name === 'sticker') {
    buffer = await models.removeBackground(buffer);
    if (name === 'sticker') {
      const border = options.border ?? 12, colour = hex(options.colour);
      buffer = await sharp(buffer).extend({ top: border, bottom: border, left: border, right: border, background: '#00000000' }).png().toBuffer();
      const sourceAlpha = await sharp(buffer).extractChannel(3).png().toBuffer();
      // Sharp morphology treats dark pixels as foreground; erode expands our white alpha mask.
      const alpha = await sharp(sourceAlpha).threshold(100).erode(border).png().toBuffer();
      const meta = await sharp(buffer).metadata();
      const outline = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: colour } }).joinChannel(await sharp(alpha).greyscale().raw().toBuffer(), { raw: { width: meta.width, height: meta.height, channels: 1 } }).png().toBuffer();
      buffer = await sharp(outline).composite([{ input: buffer }]).png().toBuffer();
      buffer = await fit(buffer, cap.dimension);
    }
    note += ' Automatic cutouts work best with a clear foreground subject.';
  } else if (name === 'collage') {
    const columns = Math.min(options.columns ?? 2, images.length), rows = Math.ceil(images.length / columns), gap = options.spacing ?? 16;
    const cell = Math.floor((cap.dimension - gap * (Math.max(columns, rows) + 1)) / Math.max(columns, rows));
    const overlays = [];
    for (let i = 0; i < images.length; i++) overlays.push({ input: await sharp(images[i]).resize(cell, cell, { fit: 'contain', background: hex(options.colour) }).png().toBuffer(), left: gap + (i % columns) * (cell + gap), top: gap + Math.floor(i / columns) * (cell + gap) });
    buffer = await sharp({ create: { width: columns * (cell + gap) + gap, height: rows * (cell + gap) + gap, channels: 4, background: hex(options.colour) } }).composite(overlays).png().toBuffer();
  } else if (name === 'crop') {
    const ratios = { square: 1, portrait: 4 / 5, story: 9 / 16, landscape: 16 / 9, banner: 5 / 2 }, ratio = ratios[options.preset || 'square'];
    const w = Math.min(width, Math.round(height * ratio)), h = Math.min(height, Math.round(width / ratio));
    buffer = await sharp(buffer).resize(Math.max(1, w), Math.max(1, h), { fit: 'cover', position: options.position || 'centre' }).png().toBuffer();
  } else if (name === 'resize') {
    const w = options.width, h = options.height ?? Math.max(1, Math.round(height * w / width));
    if (!Number.isInteger(w) || !Number.isInteger(h) || Math.min(w, h) < 1 || Math.max(w, h) > cap.dimension) throw new Error(`Dimensions must be 1–${cap.dimension}px (${plus ? 'Plus' : 'free'}).`);
    buffer = await sharp(originals[0]).resize(w, h, { fit: options['keep-aspect'] === false ? 'fill' : 'inside' }).png().toBuffer();
  } else if (name === 'compress' || name === 'convert') {
    extension = options.format || 'webp';
    let pipeline = sharp(buffer);
    if (extension === 'jpeg') pipeline = pipeline.flatten({ background: hex(options.colour) });
    buffer = await pipeline.toFormat(extension, { quality: options.quality ?? 70, compressionLevel: 9 }).toBuffer();
    if (name === 'compress') note = `Before: ${(originalSize / 1024).toFixed(1)} KB · After: ${(buffer.length / 1024).toFixed(1)} KB. ` + (buffer.length < originalSize ? `${((1 - buffer.length / originalSize) * 100).toFixed(1)}% smaller.` : 'This image is already compact; the converted file is not smaller.');
    else if (extension === 'jpeg') note += ' Transparency is replaced with the selected background colour.';
  } else if (name === 'duotone' || name === 'gradient-map') {
    const colours = name === 'duotone' ? [options.shadows, options.highlights] : String(options.colours).split(',').map(v => v.trim());
    if (colours.length < 2 || colours.length > cap.stops) throw new Error(`Use 2–${cap.stops} HEX stops (${plus ? 'Plus' : 'free'}).`);
    buffer = await gradient(buffer, colours);
  } else if (name === 'outline') {
    const { data, info } = await sharp(buffer).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const result = Buffer.alloc(data.length, 255), threshold = 220 - (options.strength ?? 50) * 2;
    for (let y = 1; y < info.height - 1; y++) for (let x = 1; x < info.width - 1; x++) {
      const p = y * info.width + x, w = info.width;
      const gx = -data[p-w-1]+data[p-w+1]-2*data[p-1]+2*data[p+1]-data[p+w-1]+data[p+w+1];
      const gy = -data[p-w-1]-2*data[p-w]-data[p-w+1]+data[p+w-1]+2*data[p+w]+data[p+w+1];
      result[p] = Math.hypot(gx, gy) > threshold ? 0 : 255;
    }
    buffer = await sharp(result, { raw: info }).png().toBuffer();
  } else if (name === 'polaroid') {
    const caption = options.caption || ''; if (caption.length > 80) throw new Error('Keep the caption to 80 characters or fewer.');
    const border = Math.max(12, Math.round(width * .05)), bottom = Math.max(70, Math.round(width * .2));
    buffer = await sharp(buffer).flatten({ background: '#fff' }).extend({ top: border, bottom, left: border, right: border, background: '#fffaf0' }).png().toBuffer();
    if (caption) {
      const canvas = createCanvas(width + border * 2, bottom), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333333'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = Math.max(14, Math.round(width * .05));
      do { ctx.font = `italic ${size--}px "Segoe Print", cursive`; } while (ctx.measureText(caption).width > width && size > 8);
      ctx.fillText(caption, canvas.width / 2, bottom / 2, width);
      buffer = await sharp(buffer).composite([{ input: canvas.toBuffer('image/png'), top: height + border, left: 0 }]).png().toBuffer();
    }
    buffer = await fit(buffer, cap.dimension);
  } else if (name === 'ascii') {
    const columns = options.columns ?? 80; if (columns > cap.columns) throw new Error(`Your plan supports up to ${cap.columns} ASCII columns.`);
    const rows = Math.max(1, Math.min(200, Math.round(height / width * columns * .48)));
    const data = await sharp(buffer).flatten({ background: '#fff' }).resize(columns, rows, { fit: 'fill' }).greyscale().raw().toBuffer();
    const chars = '@%#*+=-:. ', lines = Array.from({ length: rows }, (_, y) => Array.from({ length: columns }, (_, x) => chars[Math.min(9, Math.floor(data[y * columns + x] / 256 * 10))]).join(''));
    if (options.output === 'image') {
      const canvas = createCanvas(columns * 9 + 24, rows * 18 + 24), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#111111'; ctx.font = '15px monospace'; ctx.textBaseline = 'top';
      lines.forEach((line, y) => ctx.fillText(line, 12, 12 + y * 18)); buffer = canvas.toBuffer('image/png');
    } else { buffer = Buffer.from(lines.join('\n')); extension = 'txt'; }
  } else if (name === 'extract-text') {
    const language = options.language || 'eng'; if (!plus && language !== 'eng') throw new Error('English OCR is free. German, French and Spanish are included with Plus.');
    const text = await models.extractText(buffer, language);
    if (!text) throw new Error('No readable text found. Try a clear, upright image with larger text.');
    buffer = Buffer.from(text); extension = 'txt'; note = 'Copyable text is attached. OCR can make mistakes; check it against the original.';
  } else if (name === 'redact') {
    const meta = await sharp(originals[0]).metadata();
    const selected = regions(options.regions, meta.width, meta.height, cap.regions);
    // Burn opaque masks into original pixels BEFORE resizing. Never return an original thumbnail.
    const overlays = await Promise.all(selected.map(async region => ({ input: await sharp({ create: { width: region.width, height: region.height, channels: 4, background: '#000000' } }).png().toBuffer(), left: region.left, top: region.top })));
    buffer = await sharp(originals[0]).composite(overlays).png().toBuffer();
    buffer = await fit(buffer, cap.dimension); note = 'Selected regions are covered with opaque black pixels. Review the result before sharing; the original Discord attachment remains in its original message.';
  } else if (name === 'compare') {
    const w = Math.max(1, Math.min(width, Math.floor(cap.dimension / 2))), h = Math.max(1, Math.round(height * w / width));
    const normalized = []; for (const input of images) normalized.push(await sharp(input).flatten({ background: '#fff' }).resize(w, h, { fit: 'contain', background: '#fff' }).removeAlpha().raw().toBuffer());
    if (options.mode === 'difference') {
      const result = Buffer.alloc(normalized[0].length); let sum = 0;
      for (let i = 0; i < result.length; i++) { result[i] = Math.abs(normalized[0][i] - normalized[1][i]); sum += result[i]; }
      buffer = await sharp(result, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(); note = `Mean absolute channel difference: ${(sum / result.length / 255 * 100).toFixed(2)}%. Black means identical pixels after fitting both images to ${w} × ${h}.`;
    } else {
      const overlays = await Promise.all(normalized.map(async (raw, i) => ({ input: await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(), left: i * w, top: 0 })));
      buffer = await sharp({ create: { width: w * 2, height: h, channels: 3, background: '#fff' } }).composite(overlays).png().toBuffer(); note = 'First attachment on the left; second on the right. Images are fitted to equal panels.';
    }
  } else throw new Error('Unknown image tool.');
  return { buffer, extension, note };
}
module.exports = { processImage, limits, regions, hex, gradient };
