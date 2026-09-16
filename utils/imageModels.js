const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const modelPath = path.join(__dirname, '..', 'data', 'image-models', 'u2netp.onnx');
let sessionPromise;
async function ensureModel() {
  let bytes;
  try { bytes = await fs.readFile(modelPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!bytes) {
    const response = await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('Background model download failed. Try again later.');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 6_000_000) throw new Error('Unexpected background model size.'); chunks.push(chunk); }
    bytes = Buffer.concat(chunks);
  }
  // Published rembg checksum; validate both freshly downloaded and cached weights.
  if (crypto.createHash('md5').update(bytes).digest('hex') !== '8e83ca70e441ab06c318d82300c84806') throw new Error('Background model checksum mismatch. Run setup:images after removing the cached model.');
  await fs.mkdir(path.dirname(modelPath), { recursive: true });
  await fs.writeFile(modelPath, bytes);
  return bytes;
}
async function removeBackground(buffer) {
  const ort = require('onnxruntime-node');
  if (!sessionPromise) sessionPromise = ensureModel().then(bytes => ort.InferenceSession.create(bytes, { executionProviders: ['cpu'], intraOpNumThreads: 2 })).catch(error => { sessionPromise = null; throw error; });
  const session = await sessionPromise;
  const rgb = await sharp(buffer).flatten({ background: '#ffffff' }).resize(320, 320, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  let max = 1; for (const value of rgb) max = Math.max(max, value);
  const input = new Float32Array(3 * 320 * 320), mean = [.485, .456, .406], std = [.229, .224, .225];
  for (let p = 0; p < 320 * 320; p++) for (let c = 0; c < 3; c++) input[c * 320 * 320 + p] = (rgb[p * 3 + c] / max - mean[c]) / std[c];
  const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 320, 320]) });
  const prediction = outputs[session.outputNames[0]].data;
  let low = Infinity, high = -Infinity; for (const value of prediction) { low = Math.min(low, value); high = Math.max(high, value); }
  const mask = Buffer.alloc(prediction.length);
  for (let i = 0; i < mask.length; i++) mask[i] = Math.round(255 * (prediction[i] - low) / Math.max(high - low, 1e-6));
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = await sharp(mask, { raw: { width: 320, height: 320, channels: 1 } }).resize(info.width, info.height, { fit: 'fill' }).greyscale().raw().toBuffer();
  for (let i = 0; i < info.width * info.height; i++) data[i * 4 + 3] = Math.round(data[i * 4 + 3] * alpha[i] / 255);
  return sharp(data, { raw: info }).png().toBuffer();
}
async function extractText(buffer, language) {
  const { createWorker } = require('tesseract.js');
  const languages = { eng: () => require('@tesseract.js-data/eng'), deu: () => require('@tesseract.js-data/deu'), fra: () => require('@tesseract.js-data/fra'), spa: () => require('@tesseract.js-data/spa') };
  if (!languages[language]) throw new Error('Unsupported OCR language.');
  const data = languages[language]();
  const worker = await createWorker(language, 1, { langPath: data.langPath, gzip: true, cacheMethod: 'none', errorHandler: () => {} });
  let timer;
  try {
    const result = await Promise.race([worker.recognize(buffer), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OCR timed out. Try a smaller, clearer image.')), 90000); })]);
    return result.data.text.trim();
  } finally { clearTimeout(timer); await worker.terminate(); }
}
module.exports = { ensureModel, removeBackground, extractText };
