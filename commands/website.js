const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
async function request(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  return fetch(url, { agent: httpsAgent, ...options });
}
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');

const plusPath = path.join(__dirname, '..', 'data', 'plusUsers.json');

function isPlus(userId) {
  try {
    const data = JSON.parse(fs.readFileSync(plusPath, 'utf8'));
    return data[userId] === true;
  } catch {
    return false;
  }
}

function isPlaceholder(value) {
  return !value || value === 'REPLACE_KEY_HERE';
}

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!/^https?:\/\//i.test(value)) return `https://${value}`;
  return value;
}

function sanitizeName(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').replace(/^_+|_+$/g, '') || 'file';
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }

function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name.replace(/\\/g, '/'));
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data));
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const central = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0)]);
  return Buffer.concat([...locals, central, end]);
}

function assetUrls(html, baseUrl) {
  const urls = new Set();
  const re = /<(?:script|img|link)[^>]+(?:src|href)=["']([^"'#]+)["']/gi;
  let match;
  while ((match = re.exec(html)) && urls.size < 30) {
    try {
      const url = new URL(match[1], baseUrl);
      if (['http:', 'https:'].includes(url.protocol) && url.origin === new URL(baseUrl).origin) urls.add(url.toString());
    } catch {}
  }
  return [...urls];
}

async function downloadWebsite(url) {
  const baseUrl = normalizeUrl(url);
  const res = await request(baseUrl, { headers: { 'User-Agent': 'leaf Discord Bot' } });
  if (!res.ok) throw new Error(`Website returned HTTP ${res.status}`);
  const html = await res.text();
  const files = [{ name: 'index.html', data: Buffer.from(html) }];
  let total = files[0].data.length;

  for (const asset of assetUrls(html, baseUrl)) {
    try {
      const assetRes = await request(asset, { headers: { 'User-Agent': 'leaf Discord Bot' } });
      if (!assetRes.ok) continue;
      const data = Buffer.from(await assetRes.arrayBuffer());
      if (data.length > 2 * 1024 * 1024 || total + data.length > 8 * 1024 * 1024) continue;
      const parsed = new URL(asset);
      const assetPath = parsed.pathname.split('/').filter(Boolean).map(sanitizeName).join('/') || sanitizeName(parsed.hostname);
      files.push({ name: `assets/${assetPath}`, data });
      total += data.length;
    } catch {}
  }

  return makeZip(files);
}

function screenshotUrl(url, delay, click) {
  const normalized = normalizeUrl(url);
  const params = new URLSearchParams({
    url: normalized,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
    waitForTimeout: String(Math.max(0, Math.min(20, delay || 0)) * 1000),
    'viewport.width': '1280',
    'viewport.height': '720',
  });
  if (click) params.set('clickSelector', 'body');
  return `https://api.microlink.io/?${params.toString()}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('website')
    .setDescription('Website tools')
    .addSubcommand(sub => sub
      .setName('download')
      .setDescription('✨ Download website source files as a ZIP')
      .addStringOption(opt => opt.setName('url').setDescription('Website URL').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('screenshot')
      .setDescription('Capture a website screenshot')
      .addStringOption(opt => opt.setName('url').setDescription('Website URL').setRequired(true))
      .addIntegerOption(opt => opt.setName('delay').setDescription('Delay before capture in seconds').setRequired(false).setMinValue(0).setMaxValue(20))
      .addBooleanOption(opt => opt.setName('click').setDescription('Left-click the center before capturing').setRequired(false))),
  category: 'Utility',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const url = interaction.options.getString('url');
    const embed = await getUserEmbed(interaction.user.id, 'Website');

    if (sub === 'download') {
      if (!isPlus(interaction.user.id)) {
        embed.setTitle('Plus Required').setDescription('This command is only available to plus users.');
        return interaction.editReply({ embeds: [embed] });
      }
      try {
        const zip = await downloadWebsite(url);
        const host = sanitizeName(new URL(normalizeUrl(url)).hostname);
        const attachment = new AttachmentBuilder(zip, { name: `${host}-source.zip` });
        embed.setTitle('Website Download').setDescription(`Downloaded source files for ${normalizeUrl(url)}.`);
        return interaction.editReply({ embeds: [embed], files: [attachment] });
      } catch (error) {
        embed.setTitle('Download Failed').setDescription(error.message || 'Could not download that website.');
        return interaction.editReply({ embeds: [embed] });
      }
    }

    const delay = interaction.options.getInteger('delay') || 0;
    const click = interaction.options.getBoolean('click') || false;
    embed
      .setTitle('Website Screenshot')
      .setDescription(`${normalizeUrl(url)}${click ? '\nClick is sent as `body` click selector on the free screenshot provider.' : ''}`)
      .setImage(screenshotUrl(url, delay, click));
    return interaction.editReply({ embeds: [embed] });
  },
};
