const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const Jimp = require('jimp');
const { GifCodec, GifFrame, GifUtil } = require('gifwrap');
const fs = require('fs');
const path = require('path');
const { getUserEmbed } = require('../utils/getUserEmbed');

const fontRoot = path.join(__dirname, '..', 'fonts', 'gg-sans-font');
const boldFont = path.join(fontRoot, 'gg sans Bold.ttf');
try {
  if (fs.existsSync(boldFont)) GlobalFonts.registerFromPath(boldFont, 'GGSansBold');
} catch {}

async function attachmentBuffer(attachment) {
  if (!attachment?.contentType?.startsWith('image/')) throw new Error('Please upload a valid image file.');
  if (attachment.size > 10 * 1024 * 1024) throw new Error('Image must be under 10 MB.');
  const res = await fetch(attachment.url);
  if (!res.ok) throw new Error('Could not download the image.');
  return Buffer.from(await res.arrayBuffer());
}

async function readAttachment(attachment) {
  return Jimp.read(await attachmentBuffer(attachment));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function toBuffer(image, gif) {
  if (!gif) return image.getBufferAsync(Jimp.MIME_PNG);

  const frame = new GifFrame(image.bitmap);
  GifUtil.quantizeDekker([frame], 256);
  const encoded = await new GifCodec().encodeGif([frame], { loops: 0 });
  return encoded.buffer;
}

async function sendImage(interaction, image, name, gif) {
  const buffer = await toBuffer(image, gif);
  const attachment = new AttachmentBuilder(buffer, { name: `${name}.${gif ? 'gif' : 'png'}` });
  return interaction.editReply({ files: [attachment] });
}

async function sendGif(interaction, buffer, name) {
  const attachment = new AttachmentBuilder(buffer, { name: `${name}.gif` });
  return interaction.editReply({ files: [attachment] });
}

async function encodeGifFrames(images, delayCentisecs = 4) {
  const frames = images.map(image => {
    const frame = new GifFrame(image.bitmap);
    frame.delayCentisecs = delayCentisecs;
    return frame;
  });
  GifUtil.quantizeDekker(frames, 256);
  const encoded = await new GifCodec().encodeGif(frames, { loops: 0 });
  return encoded.buffer;
}

function imageOption(sub) {
  return sub.addAttachmentOption(opt => opt.setName('image').setDescription('Image file').setRequired(true));
}

function toGifOption(sub) {
  return sub.addBooleanOption(opt => opt.setName('to_gif').setDescription('Send as GIF').setRequired(false));
}

function fitText(ctx, text, maxWidth, maxSize, minSize) {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${size}px GGSansBold, Arial Black, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minSize;
}

async function captionImage(buffer, text) {
  const source = await loadImage(buffer);
  const safeText = String(text || '').trim().slice(0, 30) || 'caption';
  const width = source.width;
  const captionHeight = Math.max(110, Math.round(width * 0.2));
  const height = captionHeight + source.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, captionHeight);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = fitText(ctx, safeText, width - 48, Math.min(72, Math.round(width * 0.11)), 24);
  ctx.font = `${fontSize}px GGSansBold, Arial Black, Arial, sans-serif`;
  ctx.fillText(safeText, width / 2, captionHeight / 2 + 2);
  ctx.drawImage(source, 0, captionHeight);

  return Jimp.read(await canvas.encode('png'));
}

async function renderCanvasGif(buffer, frameCount, drawFrame, delayCentisecs = 4) {
  const original = await loadImage(buffer);
  const maxSide = 384;
  const scale = Math.min(1, maxSide / Math.max(original.width, original.height));
  const width = Math.max(1, Math.round(original.width * scale));
  const height = Math.max(1, Math.round(original.height * scale));

  const sourceCanvas = createCanvas(width, height);
  const sourceCtx = sourceCanvas.getContext('2d');
  sourceCtx.imageSmoothingEnabled = true;
  sourceCtx.imageSmoothingQuality = 'high';
  sourceCtx.drawImage(original, 0, 0, width, height);
  const source = await loadImage(await sourceCanvas.encode('png'));

  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, width, height);
    drawFrame(ctx, source, i, frameCount, width, height);
    frames.push(await Jimp.read(await canvas.encode('png')));
  }
  return encodeGifFrames(frames, delayCentisecs);
}

async function spinGif(buffer, speed = 5) {
  const safeSpeed = clamp(Number(speed) || 5, 1, 10);
  const delay = Math.max(2, 12 - safeSpeed);
  return renderCanvasGif(buffer, 12, (ctx, source, index, total, width, height) => {
    const angle = (Math.PI * 2 * index) / total;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);
    ctx.drawImage(source, -width / 2, -height / 2, width, height);
    ctx.restore();
  }, delay);
}

async function shakeGif(buffer, intensity = 50) {
  const safeIntensity = clamp(Number(intensity) || 50, 1, 100);
  const scale = safeIntensity / 50;
  const baseOffsets = [[0, 0], [7, -4], [-6, 3], [4, 6], [-5, -5], [7, 2], [-3, 6], [0, 0]];
  const offsets = baseOffsets.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)]);
  return renderCanvasGif(buffer, offsets.length, (ctx, source, index, total, width, height) => {
    const [x, y] = offsets[index % offsets.length];
    ctx.drawImage(source, x, y, width, height);
  }, 4);
}

async function canvasImage(buffer, draw) {
  const source = await loadImage(buffer);
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  draw(ctx, source, source.width, source.height);
  return Jimp.read(await canvas.encode('png'));
}

async function rainImage(buffer) {
  return canvasImage(buffer, (ctx, source, width, height) => {
    ctx.drawImage(source, 0, 0, width, height);
    ctx.strokeStyle = 'rgba(185, 210, 255, 0.62)';
    ctx.lineWidth = Math.max(1, Math.round(width / 420));
    ctx.lineCap = 'round';
    const count = Math.max(55, Math.round((width * height) / 7000));
    for (let i = 0; i < count; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const len = 14 + Math.random() * 28;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.35, y + len);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(45, 65, 100, 0.12)';
    ctx.fillRect(0, 0, width, height);
  });
}

async function rainGif(buffer) {
  return renderCanvasGif(buffer, 12, (ctx, source, index, total, width, height) => {
    ctx.drawImage(source, 0, 0, width, height);
    ctx.strokeStyle = 'rgba(185, 210, 255, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    const count = 70;
    for (let i = 0; i < count; i++) {
      const seed = i * 97;
      const x = ((seed * 13) % (width + 80)) - 40;
      const y = ((seed * 29 + index * 24) % (height + 80)) - 40;
      const len = 18 + (seed % 22);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.35, y + len);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(45, 65, 100, 0.10)';
    ctx.fillRect(0, 0, width, height);
  }, 5);
}

async function glitchImage(buffer) {
  return canvasImage(buffer, (ctx, source, width, height) => {
    ctx.drawImage(source, 0, 0, width, height);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.42;
    ctx.drawImage(source, -7, 0, width, height);
    ctx.fillStyle = '#ff3355';
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(source, 7, 0, width, height);
    ctx.fillStyle = '#33b5ff';
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 12; i++) {
      const y = Math.floor(Math.random() * height);
      const h = 4 + Math.floor(Math.random() * 22);
      const offset = Math.floor(Math.random() * 28) - 14;
      ctx.drawImage(source, 0, y, width, h, offset, y, width, h);
    }
  });
}

async function glitchGif(buffer) {
  return renderCanvasGif(buffer, 10, (ctx, source, index, total, width, height) => {
    ctx.drawImage(source, 0, 0, width, height);
    const shift = (index % 2 === 0 ? 1 : -1) * (5 + (index % 4) * 2);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(source, shift, 0, width, height);
    ctx.drawImage(source, -shift, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 8; i++) {
      const y = (index * 31 + i * 47) % height;
      const h = 5 + ((index + i) % 18);
      const offset = ((index + i) % 2 === 0 ? 1 : -1) * (8 + ((index * i) % 18));
      ctx.drawImage(source, 0, y, width, h, offset, y, width, h);
    }
  }, 4);
}

async function zoomGif(buffer) {
  return renderCanvasGif(buffer, 14, (ctx, source, index, total, width, height) => {
    const half = total / 2;
    const progress = index <= half ? index / half : (total - index) / half;
    const scale = 1 + progress * 0.28;
    const drawW = width * scale;
    const drawH = height * scale;
    ctx.drawImage(source, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  }, 5);
}
function swirl(image, intensity) {
  const src = image.clone();
  const { width, height } = image.bitmap;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.sqrt(cx * cx + cy * cy);
  const strength = (clamp(intensity, 1, 100) / 100) * Math.PI * 3;

  image.scan(0, 0, width, height, function (x, y, idx) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const amount = strength * (1 - dist / radius);
    const angle = Math.atan2(dy, dx) + amount;
    const sx = Math.round(cx + Math.cos(angle) * dist);
    const sy = Math.round(cy + Math.sin(angle) * dist);

    if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
      const color = src.getPixelColor(sx, sy);
      this.bitmap.data.writeUInt32BE(color, idx);
    }
  });

  return image;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('media')
    .setDescription('Media editing tools')
    .addSubcommand(sub => imageOption(sub.setName('imagetogif').setDescription('Convert an image to GIF')))
    .addSubcommand(sub => toGifOption(imageOption(sub.setName('flip').setDescription('Flip an image'))
      .addStringOption(opt => opt.setName('direction').setDescription('Flip direction').setRequired(false).addChoices(
        { name: 'Horizontal', value: 'horizontal' },
        { name: 'Vertical', value: 'vertical' },
        { name: 'Both', value: 'both' },
      ))))
    .addSubcommand(sub => toGifOption(imageOption(sub.setName('invert').setDescription('Invert image colors'))))
    .addSubcommand(sub => toGifOption(imageOption(sub.setName('blackandwhite').setDescription('Convert an image to black and white'))))
    .addSubcommand(sub => toGifOption(imageOption(sub.setName('stretch').setDescription('Stretch an image horizontally'))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Stretch percent, 50-300').setRequired(false).setMinValue(50).setMaxValue(300))))
    .addSubcommand(sub => toGifOption(imageOption(sub.setName('pixelate').setDescription('Pixelate an image'))
      .addIntegerOption(opt => opt.setName('size').setDescription('Pixel size, 2-40').setRequired(false).setMinValue(2).setMaxValue(40))))
    .addSubcommand(sub => toGifOption(imageOption(sub
      .setName('caption')
      .setDescription('Add a top caption to an image')
      .addStringOption(opt => opt.setName('text').setDescription('Caption text, max 30 characters').setRequired(true).setMaxLength(30)))))
    .addSubcommand(sub => toGifOption(imageOption(sub
      .setName('blur')
      .setDescription('Blur an uploaded image'))
      .addIntegerOption(opt => opt.setName('intensity').setDescription('Blur intensity, 1-100').setRequired(false).setMinValue(1).setMaxValue(100))))
    .addSubcommand(sub => toGifOption(imageOption(sub
      .setName('circle')
      .setDescription('Twist an uploaded image in a circle effect'))
      .addIntegerOption(opt => opt.setName('intensity').setDescription('Circle intensity, 1-100').setRequired(false).setMinValue(1).setMaxValue(100))))
    .addSubcommand(sub => imageOption(sub.setName('shake').setDescription('Create a shaky GIF from an image'))
      .addIntegerOption(opt => opt.setName('intensity').setDescription('Shake intensity, 1-100').setRequired(false).setMinValue(1).setMaxValue(100)))
    .addSubcommand(sub => imageOption(sub.setName('spin').setDescription('Create a spinning GIF from an image'))
      .addIntegerOption(opt => opt.setName('speed').setDescription('Spin speed, 1-10').setRequired(false).setMinValue(1).setMaxValue(10)))
    .addSubcommand(sub => toGifOption(imageOption(sub.setName('rain').setDescription('Add rain to an image'))))
    .addSubcommand(sub => toGifOption(imageOption(sub.setName('glitch').setDescription('Add a glitch effect to an image'))))
    .addSubcommand(sub => imageOption(sub.setName('zoom').setDescription('Create a zoom GIF from an image')))
    .addSubcommand(sub => sub.setName('qr').setDescription('Create a QR code from text or a link').addStringOption(opt => opt.setName('text').setDescription('Text or link to convert').setRequired(true))),
  category: 'Image',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gif = sub === 'imagetogif' || (interaction.options.getBoolean('to_gif') || false);

    try {
      if (sub === 'qr') return require('./qr').execute(interaction);
      const attachment = interaction.options.getAttachment('image');
      if (sub === 'caption') {
        const image = await captionImage(await attachmentBuffer(attachment), interaction.options.getString('text'));
        return sendImage(interaction, image, 'caption', gif);
      }
      if (sub === 'shake' || sub === 'spin') {
        const buffer = await attachmentBuffer(attachment);
        const gifBuffer = sub === 'shake'
          ? await shakeGif(buffer, interaction.options.getInteger('intensity') || 50)
          : await spinGif(buffer, interaction.options.getInteger('speed') || 5);
        return sendGif(interaction, gifBuffer, sub);
      }
      if (sub === 'rain' || sub === 'glitch' || sub === 'zoom') {
        const buffer = await attachmentBuffer(attachment);
        if (sub === 'zoom') return sendGif(interaction, await zoomGif(buffer), 'zoom');
        if (sub === 'rain') {
          if (gif) return sendGif(interaction, await rainGif(buffer), 'rain');
          return sendImage(interaction, await rainImage(buffer), 'rain', false);
        }
        if (gif) return sendGif(interaction, await glitchGif(buffer), 'glitch');
        return sendImage(interaction, await glitchImage(buffer), 'glitch', false);
      }

      const image = await readAttachment(attachment);
      if (sub === 'imagetogif') return sendImage(interaction, image, 'image-to-gif', true);
      if (sub === 'flip') {
        const dir = interaction.options.getString('direction') || 'horizontal';
        image.mirror(dir === 'horizontal' || dir === 'both', dir === 'vertical' || dir === 'both');
        return sendImage(interaction, image, 'flipped', gif);
      }
      if (sub === 'invert') { image.invert(); return sendImage(interaction, image, 'inverted', gif); }
      if (sub === 'blackandwhite') { image.greyscale(); return sendImage(interaction, image, 'black-and-white', gif); }
      if (sub === 'stretch') {
        const amount = interaction.options.getInteger('amount') || 150;
        image.resize(Math.max(1, Math.round(image.bitmap.width * amount / 100)), image.bitmap.height);
        return sendImage(interaction, image, 'stretched', gif);
      }
      if (sub === 'pixelate') {
        image.pixelate(interaction.options.getInteger('size') || 10);
        return sendImage(interaction, image, 'pixelated', gif);
      }
      if (sub === 'blur') {
        const intensity = interaction.options.getInteger('intensity') || 35;
        image.blur(Math.max(1, Math.round(intensity / 4)));
        return sendImage(interaction, image, 'blurred', gif);
      }
      if (sub === 'circle') {
        swirl(image, interaction.options.getInteger('intensity') || 55);
        return sendImage(interaction, image, 'circle', gif);
      }
    } catch (error) {
      const embed = await getUserEmbed(interaction.user.id, null, 'error');
      embed.setDescription(error.message || 'Could not process that image.');
      return interaction.editReply({ embeds: [embed] });
    }
  },
};






