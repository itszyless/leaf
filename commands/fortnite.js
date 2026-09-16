const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const https = require('https');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getUserEmbed } = require('../utils/getUserEmbed');
const config = require('../config.json');

const BASE = 'https://fortnite-api.com/v2';
const MAP_JSON = 'https://fortnite-api.com/v1/map';
const SHOP_IMAGE_LIMIT = 180;
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const fetchRemote = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function getFortniteKey() {
  return String(
    process.env.FORTNITE_API_KEY ||
    config.Fortnite_API_Key ||
    config.Fortnite_API_TOKEN ||
    config.FortniteApiKey ||
    config.FortniteApiToken ||
    config['Fortnite-API-Key'] ||
    config['Fortnite-API-Token'] ||
    ''
  ).trim();
}

async function fortniteFetch(url, options = {}) {
  return fetchRemote(url, { ...options, agent: httpsAgent, headers: { 'User-Agent': 'leaf/1.0', ...(options.headers || {}) } });
}

async function fetchBuffer(url) {
  const res = await fortniteFetch(url);
  if (!res.ok) throw new Error(`Image HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fortniteGet(path, { requireKey = false } = {}) {
  const key = getFortniteKey();
  if (requireKey && !key) {
    throw new Error('This lookup needs a Fortnite-API key. Add it as Fortnite_API_Key in config.json or set FORTNITE_API_KEY.');
  }

  const headers = { Accept: 'application/json' };
  if (key) headers.Authorization = key;

  const res = await fortniteFetch(`${BASE}${path}`, { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data.data;
}

function firstImage(item) {
  return item?.images?.featured || item?.images?.icon || item?.images?.smallIcon || item?.displayAssets?.[0]?.url || item?.newDisplayAsset?.renderImages?.[0]?.image || null;
}

function shopImage(shop) {
  return shop?.image || shop?.images?.featured || shop?.images?.icon || shop?.renderedImage || shop?.displayImage || null;
}

async function buildShopGrid(entries) {
  const items = entries.slice(0, SHOP_IMAGE_LIMIT).map(entry => {
    const item = entry.brItems?.[0] || entry.items?.[0] || entry;
    return {
      name: item.name || entry.devName || 'Unknown item',
      price: entry.finalPrice || entry.regularPrice || entry.price || '?',
      image: firstImage(item) || entry.newDisplayAsset?.renderImages?.[0]?.image,
    };
  }).filter(item => item.image);

  if (!items.length) return null;

  const cols = 6;
  const card = 160;
  const gap = 14;
  const pad = 34;
  const titleH = 86;
  const rows = Math.ceil(items.length / cols);
  const width = pad * 2 + cols * card + (cols - 1) * gap;
  const height = pad * 2 + titleH + rows * (card + 62) + (rows - 1) * gap;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#10141f';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.fillText("Today's Fortnite Shop", pad, 56);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const x = pad + (i % cols) * (card + gap);
    const y = pad + titleH + Math.floor(i / cols) * (card + 62 + gap);

    ctx.fillStyle = '#202838';
    ctx.fillRect(x, y, card, card + 62);

    try {
      const imageBuffer = await fetchBuffer(item.image);
      const img = await loadImage(imageBuffer);
      ctx.drawImage(img, x, y, card, card);
    } catch {
      ctx.fillStyle = '#313b52';
      ctx.fillRect(x, y, card, card);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(x, y + card - 54, card, 54);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText(String(item.name).slice(0, 24), x + 10, y + card - 26);
    ctx.fillStyle = '#cdd6f4';
    ctx.font = '15px Arial, sans-serif';
    ctx.fillText(String(item.price) + ' V-Bucks', x + 10, y + card + 38);
  }

  return await canvas.encode('png');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fortnite')
    .setDescription('Fortnite lookup commands')
    .addSubcommand(sub => sub
      .setName('cosmetic')
      .setDescription('Look up a Fortnite cosmetic')
      .addStringOption(opt => opt.setName('name').setDescription('Cosmetic name').setRequired(true).setMaxLength(80)))
    .addSubcommand(sub => sub.setName('map').setDescription('View the current Fortnite map image'))
    .addSubcommand(sub => sub.setName('shop').setDescription("View today's Fortnite shop image"))
    .addSubcommand(sub => sub
      .setName('user')
      .setDescription('View Fortnite stats for a player')
      .addStringOption(opt => opt.setName('username').setDescription('Epic username').setRequired(true).setMaxLength(80))),
  category: 'Fun',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const embed = await getUserEmbed(interaction.user.id, 'Fortnite');

    try {
      if (sub === 'cosmetic') {
        const name = interaction.options.getString('name');
        const item = await fortniteGet(`/cosmetics/br/search?name=${encodeURIComponent(name)}`);
        embed.setTitle(item.name || 'Cosmetic')
          .setDescription(item.description || 'No description available.')
          .addFields(
            { name: 'Type', value: item.type?.displayValue || 'Unknown', inline: true },
            { name: 'Rarity', value: item.rarity?.displayValue || 'Unknown', inline: true },
            { name: 'Set', value: item.set?.text || 'None', inline: true },
          );
        const image = firstImage(item);
        if (image) embed.setThumbnail(image);
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'map') {
        let imageUrl = 'https://fortnite-api.com/images/map_en.png';
        const mapRes = await fortniteFetch(MAP_JSON).catch(() => null);
        if (mapRes?.ok) {
          const mapJson = await mapRes.json().catch(() => null);
          imageUrl = mapJson?.data?.images?.pois || mapJson?.data?.images?.blank || imageUrl;
        }

        const buffer = await fetchBuffer(imageUrl);
        const attachment = new AttachmentBuilder(buffer, { name: 'fortnite-map.png' });
        embed
          .setTitle('Current Fortnite Map')
          .setDescription('Latest public map image with POI names.')
          .setImage('attachment://fortnite-map.png');
        return interaction.editReply({ embeds: [embed], files: [attachment] });
      }

      if (sub === 'shop') {
        const shop = await fortniteGet('/shop');
        const entries = shop.entries || shop.br?.entries || [];
        const lines = entries.slice(0, 20).map(entry => {
          const item = entry.brItems?.[0] || entry.items?.[0] || entry.devName || {};
          const name = item.name || entry.devName || 'Unknown item';
          const price = entry.finalPrice || entry.regularPrice || entry.price || '?';
          return `**${name}** - ${price} V-Bucks`;
        });

        embed.setTitle("Today's Fortnite Shop")
          .setDescription(lines.length ? lines.join('\n') : 'No shop entries found.');

        const image = shopImage(shop);
        if (image) {
          try {
            const imageBuffer = await fetchBuffer(image);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'fortnite-shop.png' });
            embed.setImage('attachment://fortnite-shop.png');
            return interaction.editReply({ embeds: [embed], files: [attachment] });
          } catch {
            embed.setImage(image);
            return interaction.editReply({ embeds: [embed] });
          }
        }

        const grid = await buildShopGrid(entries);
        if (grid) {
          const attachment = new AttachmentBuilder(grid, { name: 'fortnite-shop.png' });
          embed.setImage('attachment://fortnite-shop.png');
          return interaction.editReply({ embeds: [embed], files: [attachment] });
        }

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'user') {
        const username = interaction.options.getString('username');
        const stats = await fortniteGet(`/stats/br/v2?name=${encodeURIComponent(username)}&accountType=epic`, { requireKey: true });
        const overall = stats.stats?.all?.overall || stats.stats?.keyboardMouse?.overall || stats.stats?.gamepad?.overall;
        embed.setTitle(`${stats.account?.name || username} Fortnite Stats`)
          .setDescription(overall ? `Wins: **${overall.wins?.toLocaleString() || 0}**\nKills: **${overall.kills?.toLocaleString() || 0}**\nMatches: **${overall.matches?.toLocaleString() || 0}**\nK/D: **${overall.kd || '0'}**\nWin Rate: **${overall.winRate || '0'}%**` : 'No public stats found for this player.');
        return interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      const message = String(error.message || error);
      const clean = /invalid or missing api key|401/i.test(message)
        ? 'Fortnite player stats need a valid Fortnite-API.com key. Add a valid key as Fortnite_API_Key in config.json. Cosmetic, map, and shop do not need a key.'
        : message;
      embed.setTitle('Fortnite Lookup Failed').setDescription(clean.slice(0, 500));
      return interaction.editReply({ embeds: [embed] });
    }
  },
};



