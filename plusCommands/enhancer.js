const {
  SlashCommandBuilder,
} = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const FormData = require('form-data');
const { createCanvas, loadImage } = require('canvas');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('enhancer')
    .setDescription('Image enhancement tools (Plus only)')
    .addSubcommand(sub =>
      sub
        .setName('upscale')
        .setDescription('Upscale and enhance an image')
        .addAttachmentOption(opt =>
          opt
            .setName('image')
            .setDescription('Image to enhance')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('scale')
            .setDescription('Requested upscale factor (1-4, used for fallback)')
            .addChoices(
              { name: 'x1', value: 1 },
              { name: 'x2', value: 2 },
              { name: 'x3', value: 3 },
              { name: 'x4', value: 4 },
            )
        )
    ),

  category: 'Plus',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const lang = getUserLanguage(interaction.user.id) || 'en';

    if (sub === 'upscale') {
      const attachment = interaction.options.getAttachment('image');
      const scaleInput = interaction.options.getInteger('scale') || 2;
      const scaleFactor = Math.min(4, Math.max(1, scaleInput));

      const titleText = await translateText('Image Enhancer', lang);
      const processingText = await translateText('Processing your image. Please wait.', lang);
      const notImageText = await translateText('The provided file must be an image.', lang);
      const tooBigText = await translateText('The image is too large. Please use a smaller file.', lang);
      const failText = await translateText('Failed to process the image. Please try again later.', lang);
      const resultTitleText = await translateText('Upscaled image', lang);
      const scaleLabelText = await translateText('Requested scale factor', lang);
      const resolutionLabelText = await translateText('Resolution', lang);
      const modeAiText = await translateText('Mode', lang);
      const aiLabelText = await translateText('AI crisp upscale', lang);
      const fallbackLabelText = await translateText('High quality resize', lang);

      if (!attachment || !attachment.contentType || !attachment.contentType.startsWith('image/')) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(notImageText);
        return interaction.editReply({ embeds: [embed] });
      }

      if (attachment.size && attachment.size > 8 * 1024 * 1024) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(tooBigText);
        return interaction.editReply({ embeds: [embed] });
      }

      const loadingEmbed = (await getUserEmbed(interaction.user.id, 'Enhancer'))
        .setTitle(titleText)
        .setDescription(processingText);

      await interaction.editReply({ embeds: [loadingEmbed] });

      try {
        // 1) Original Bild laden
        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error('Image download failed');
        const buffer = await res.buffer();

        let outputBuffer = null;
        let usedAi = false;

        // 2) Versuch AI Upscale über Recraft

        // 3) Falls AI nicht verfügbar/fehlgeschlagen -> Canvas Upscale + Sharpen
        let resolutionText;
        if (!outputBuffer) {
          const { buffer: fallbackBuffer, resolutionText: resText } =
            await fallbackUpscale(buffer, attachment.contentType, scaleFactor);
          outputBuffer = fallbackBuffer;
          resolutionText = resText;
        }

        // wenn AI genutzt wurde, müssen wir die neue Auflösung lesen
        if (usedAi && !resolutionText) {
          try {
            const img = await loadImage(outputBuffer);
            const original = await loadImage(buffer);
            resolutionText = `${original.width}x${original.height} → ${img.width}x${img.height}`;
          } catch {
            resolutionText = 'AI upscale';
          }
        }

        const modeLabel = usedAi ? aiLabelText : fallbackLabelText;

        const embed = (await getUserEmbed(interaction.user.id, 'Enhancer'))
          .setTitle(resultTitleText)
          .setDescription(
            `${scaleLabelText}: **x${scaleFactor}**\n${resolutionLabelText}: **${resolutionText}**\n${modeAiText}: **${modeLabel}**`
          )
          .setImage('attachment://enhanced.png');

        return interaction.editReply({
          embeds: [embed],
          files: [{ attachment: outputBuffer, name: 'enhanced.png' }],
        });
      } catch (err) {
        console.error('Error in /enhancer upscale:', err);
        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(failText);
        return interaction.editReply({ embeds: [embed] });
      }
    }
  },
};

// ---- AI Crisp Upscale über Recraft ----
// Doku: https://external.api.recraft.ai/v1/images/crispUpscale (multipart/form-data) :contentReference[oaicite:1]{index=1}
async function aiEnhanceImage(buffer, contentType, apiKey) {
  const form = new FormData();
  form.append('file', buffer, {
    filename: 'image',
    contentType: contentType || 'image/png',
  });

  const res = await fetch('https://external.api.recraft.ai/v1/images/crispUpscale', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Recraft API error: ${res.status}`);
  }

  const json = await res.json();
  const url = json?.image?.url;
  if (!url) {
    throw new Error('Recraft API: no image URL in response');
  }

  const imgRes = await fetch(url);
  if (!imgRes.ok) {
    throw new Error('Failed to download enhanced image');
  }

  return await imgRes.buffer();
}

// ---- Fallback: Canvas Upscale + Schärfen ----
async function fallbackUpscale(buffer, contentType, scaleFactor) {
  const img = await loadImage(buffer);

  const srcW = img.width;
  const srcH = img.height;
  const outW = Math.round(srcW * scaleFactor);
  const outH = Math.round(srcH * scaleFactor);

  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext('2d');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  applySharpen(ctx, outW, outH);

  const outBuffer = canvas.toBuffer('image/png');
  const resolutionText = `${srcW}x${srcH} → ${outW}x${outH}`;

  return { buffer: outBuffer, resolutionText };
}

// simple 3x3 sharpen filter
function applySharpen(ctx, width, height) {
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const out = new Uint8ClampedArray(data.length);

    const w = width;
    const h = height;

    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0,
    ];

    const kSize = 3;
    const kHalf = Math.floor(kSize / 2);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;

        for (let ky = -kHalf; ky <= kHalf; ky++) {
          for (let kx = -kHalf; kx <= kHalf; kx++) {
            const px = Math.min(w - 1, Math.max(0, x + kx));
            const py = Math.min(h - 1, Math.max(0, y + ky));
            const idx = (py * w + px) * 4;
            const kval = kernel[(ky + kHalf) * kSize + (kx + kHalf)];

            r += data[idx] * kval;
            g += data[idx + 1] * kval;
            b += data[idx + 2] * kval;
            a += data[idx + 3] * kval;
          }
        }

        const i = (y * w + x) * 4;
        out[i] = clamp(r);
        out[i + 1] = clamp(g);
        out[i + 2] = clamp(b);
        out[i + 3] = clamp(a, 0, 255);
      }
    }

    for (let i = 0; i < data.length; i++) {
      data[i] = out[i];
    }

    ctx.putImageData(imageData, 0, 0);
  } catch (err) {
    console.error('Sharpen filter failed:', err);
  }
}

function clamp(value, min = 0, max = 255) {
  return value < min ? min : value > max ? max : value;
}
