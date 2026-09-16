const sharp = require('sharp');

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
const PAGE_SIZE = 5;
const paletteLimit = plus => plus ? 30 : 15;
const FORMATS = new Set(['png', 'jpeg', 'webp', 'gif', 'avif']);

async function downloadImage(attachment) {
  if (!attachment || attachment.size > MAX_BYTES) throw new Error('Attach an image no larger than 10 MB.');
  // Only fetch an actual Discord attachment, never an arbitrary user-controlled URL.
  let url;
  try { url = new URL(attachment.url); } catch { throw new Error('Invalid attachment URL. Please upload the image again.'); }
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) ||
      !/^\/(?:ephemeral-)?attachments\//.test(url.pathname)) {
    throw new Error('Please attach the image directly in Discord.');
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error('Could not download that attachment. Please upload it again.');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Images must be no larger than 10 MB.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Images must be no larger than 10 MB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function rgbToLab(rgb) {
  const [r, g, b] = rgb.map(value => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = value => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const distance = (a, b) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);

function summarize(points) {
  const weight = points.reduce((sum, p) => sum + p.weight, 0);
  const rgb = [0, 1, 2].map(i => points.reduce((sum, p) => sum + p.rgb[i] * p.weight, 0) / weight);
  const lab = rgbToLab(rgb);
  const variances = [0, 1, 2].map(i => points.reduce((sum, p) => sum + p.weight * (p.lab[i] - lab[i]) ** 2, 0));
  const axis = variances.indexOf(Math.max(...variances));
  return { points, weight, rgb, lab, axis, score: points.length > 1 ? variances[axis] : 0 };
}

function extractColors(data, limit = 30) {
  const histogram = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 32) continue; // Invisible RGB must not dominate transparent images.
    const weight = alpha / 255;
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    let bin = histogram.get(key);
    if (!bin) { bin = { weight: 0, sums: [0, 0, 0] }; histogram.set(key, bin); }
    bin.weight += weight;
    for (let j = 0; j < 3; j++) bin.sums[j] += data[i + j] * weight;
  }
  if (!histogram.size) throw new Error('This image is fully transparent. Try an image with visible colours.');
  const points = [...histogram.values()].map(bin => {
    const rgb = bin.sums.map(sum => sum / bin.weight);
    return { rgb, lab: rgbToLab(rgb), weight: bin.weight };
  });
  const totalWeight = points.reduce((sum, p) => sum + p.weight, 0);
  const buckets = [summarize(points)];
  // Weighted median cut gives broad image regions priority over isolated pixels.
  while (buckets.length < 90) {
    let index = 0;
    for (let i = 1; i < buckets.length; i++) if (buckets[i].score > buckets[index].score) index = i;
    const bucket = buckets[index];
    if (bucket.score < 0.01) break;
    const sorted = [...bucket.points].sort((a, b) => a.lab[bucket.axis] - b.lab[bucket.axis]);
    let cumulative = 0, split = 1;
    for (; split < sorted.length; split++) {
      cumulative += sorted[split - 1].weight;
      if (cumulative >= bucket.weight / 2) break;
    }
    split = Math.min(split, sorted.length - 1);
    buckets.splice(index, 1, summarize(sorted.slice(0, split)), summarize(sorted.slice(split)));
  }
  // Merge perceptually close shades, even when fewer than 30 colours remain.
  let clusters = buckets.map(({ rgb, lab, weight }) => ({ rgb, lab, weight }));
  while (clusters.length > 1) {
    let nearest = Infinity, pair;
    for (let a = 0; a < clusters.length; a++) for (let b = a + 1; b < clusters.length; b++) {
      const d = distance(clusters[a].lab, clusters[b].lab);
      if (d < nearest) { nearest = d; pair = [a, b]; }
    }
    if (clusters.length <= 30 && nearest >= 12 ** 2) break;
    const [a, b] = pair, first = clusters[a], second = clusters[b];
    const weight = first.weight + second.weight;
    const rgb = first.rgb.map((value, i) => (value * first.weight + second.rgb[i] * second.weight) / weight);
    clusters[a] = { rgb, lab: rgbToLab(rgb), weight };
    clusters.splice(b, 1);
  }
  clusters.sort((a, b) => b.weight - a.weight);
  // Tiny specks and compression noise are not important palette colours.
  clusters = clusters.filter((c, i) => i === 0 || c.weight / totalWeight >= 0.005);
  return clusters.slice(0, Math.min(limit, 30)).map(cluster => {
    const rgb = cluster.rgb.map(Math.round);
    return { rgb, hex: '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase(),
      percentage: cluster.weight / totalWeight * 100 };
  });
}

async function paletteFromBuffer(buffer, limit = 30) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BYTES) throw new Error('Images must be no larger than 10 MB.');
  try {
    const image = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'warning', pages: 1 });
    const metadata = await image.metadata();
    if (!FORMATS.has(metadata.format) && !(metadata.format === 'heif' && metadata.compression === 'av1')) {
      throw new Error('Use PNG, JPEG, WebP, GIF or AVIF images.');
    }
    const data = await image.rotate().resize({ width: 192, height: 192, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb').ensureAlpha().raw().toBuffer();
    return { colors: extractColors(data, limit), animated: (metadata.pages || 1) > 1 };
  } catch (error) {
    if (/transparent|Use PNG/.test(error.message)) throw error;
    throw new Error('Could not read this image. Use a valid PNG, JPEG, WebP, GIF or AVIF under 10 MB and 25 megapixels.');
  }
}

function colorPages(colors) {
  return Array.from({ length: Math.ceil(colors.length / PAGE_SIZE) }, (_, page) => colors.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
}

async function swatchBuffer(colors) {
  const width = colors.length * 160, height = 100;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const rgb = colors[Math.floor(x / 160)].rgb;
    const offset = (y * width + x) * 3;
    raw[offset] = rgb[0]; raw[offset + 1] = rgb[1]; raw[offset + 2] = rgb[2];
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

module.exports = { downloadImage, paletteFromBuffer, extractColors, colorPages, swatchBuffer, paletteLimit, MAX_BYTES };
