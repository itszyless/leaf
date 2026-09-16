// spotify.js
const { SlashCommandBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { createCanvas, loadImage } = require('canvas');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const config = require('../config.json');
  const path = require('path');
const fs = require('fs');

// const { isPlus } = require('../utils/plus'); // optional plus gate

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spotify')
    .setDescription('Create an iOS-style now-playing image from a Spotify link or song name (Plus)')
    .addStringOption(o => o.setName('query').setDescription('Spotify track URL or song name').setRequired(true))
    .addNumberOption(o => o.setName('progress').setDescription('Progress (seconds)').setMinValue(0))
    .addStringOption(o => o.setName('market').setDescription('Market (default: US)'))
    .addStringOption(o => o.setName('device').setDescription('Device label (default: iPhone)'))
    .addStringOption(o =>
      o.setName('paused')
        .setDescription('Show play (paused) or pause (playing) icon')
        .addChoices({ name: 'On (paused)', value: 'on' }, { name: 'Off (playing)', value: 'off' })
        .setRequired(false)
    ),
  category: 'Plus',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const t = (s) => translateText(s, lang);

    // if (!isPlus?.(interaction.user.id)) {
    //   return interaction.editReply({ content: await t('This command is Plus only.'), ephemeral: true });
    // }

    const SPOTIFY_ID = config.Spotify_Client_ID;
    const SPOTIFY_SECRET = config.Spotify_Client_Secret;
    if (!SPOTIFY_ID || !SPOTIFY_SECRET) {
      return interaction.editReply({
        content: await t('Spotify credentials are missing in config.json (Spotify_Client_ID / Spotify_Client_Secret).'),
        ephemeral: true
      });
    }

    const query = interaction.options.getString('query', true).trim();
    const market = interaction.options.getString('market') || 'US';
    const device = interaction.options.getString('device') || 'iPhone';
    const pausedOpt = interaction.options.getString('paused') || 'on'; // default ON (paused)
    const paused = pausedOpt === 'on';

    let progressSec = interaction.options.getNumber('progress') ?? 0;
    if (Number.isNaN(progressSec) || progressSec < 0) progressSec = 0;

    try {
      const token = await getSpotifyToken(SPOTIFY_ID, SPOTIFY_SECRET);
      const id = parseSpotifyTrackId(query);
      const track = id ? await getTrackById(token, id, market) : await searchTrack(token, query, market);
      if (!track) {
        return interaction.editReply({ content: await t('No track found. Try a different query or a direct Spotify track URL.') });
      }

      const image = await renderIOSCard(track, { device, progressSec, paused });
      return interaction.editReply({ files: [{ attachment: image, name: 'nowplaying.png' }] }); // image only
    } catch (err) {
      console.error('SPOTIFY /spotify ERROR:', err);
      return interaction.editReply({ content: await t('Failed to render the Spotify image. Please try again.') });
    }
  }
};

/* -------------------------- Spotify helpers -------------------------- */

async function getSpotifyToken(id, secret) {
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });
  if (!res.ok) throw new Error('Spotify token failed');
  const data = await res.json();
  return data.access_token;
}

function parseSpotifyTrackId(input) {
  const urlMatch = input.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)(?:\?|$|\/)/i);
  if (urlMatch) return urlMatch[1];
  const uriMatch = input.match(/spotify:track:([A-Za-z0-9]+)/i);
  if (uriMatch) return uriMatch[1];
  return null;
}

async function getTrackById(token, id, market = 'US') {
  const res = await fetch(`https://api.spotify.com/v1/tracks/${id}?market=${encodeURIComponent(market)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return await res.json();
}

async function searchTrack(token, q, market = 'US') {
  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', '1');
  url.searchParams.set('market', market);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.tracks?.items?.[0] || null;
}

/* ---------------------------- Card rendering ---------------------------- */

async function renderIOSCard(track, { device = 'iPhone', progressSec = 0, paused = true }) {
  // base size (taller than wide)
  let width = 620;
  const artSize = 420;
  let extraHeight = 220;
  let height = artSize + extraHeight;

  const coverUrl = track.album?.images?.[0]?.url || track.album?.images?.[1]?.url || track.album?.images?.[2]?.url;
  const cover = coverUrl ? await safeLoad(coverUrl) : null;
  const dom = cover ? await dominantColor(cover) : { r: 18, g: 20, b: 22 };
  const baseBg = `rgb(${dom.r}, ${dom.g}, ${dom.b})`;

  // text measurement to grow width if needed
  const tmp = createCanvas(10, 10);
  const mctx = tmp.getContext('2d');
  const title = track.name || 'Unknown Title';
  const explicit = track.explicit;
  const artists = (track.artists || []).map(a => a.name).join(', ') || 'Unknown Artist';
  const album = track.album?.name || '';
  const sub = album ? `${artists} — ${album}` : artists;

  const fontTitle = '700 22px -apple-system, "SF Pro Display", "Segoe UI", Arial';
  const fontSub = '500 16px -apple-system, "SF Pro Text", "Segoe UI", Arial';
  const fontDevice = '600 13px -apple-system, "SF Pro Text", "Segoe UI", Arial';

  mctx.font = fontTitle;
  const titleW = mctx.measureText(title).width + (explicit ? 22 : 0);
  mctx.font = fontSub;
  const subW = mctx.measureText(sub).width;

  const padOuter = 24;
  const neededContent = Math.max(titleW, subW, artSize) + padOuter * 2;
  width = Math.max(width, Math.ceil(neededContent));
  height = Math.max(height, Math.round(width * 1.05));

  const corner = 34;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // background + blur
  ctx.fillStyle = baseBg;
  roundedRect(ctx, 0, 0, width, height, corner); ctx.fill();
  if (cover) {
    const scale = Math.max(width / cover.width, height / cover.height);
    const bgW = cover.width * scale;
    const bgH = cover.height * scale;
    const bgX = (width - bgW) / 2;
    const bgY = (height - bgH) / 2;

    try {
      if ('filter' in ctx) {
        ctx.filter = 'blur(22px) brightness(0.92)';
        ctx.drawImage(cover, bgX, bgY, bgW, bgH);
        ctx.filter = 'none';
      } else {
        for (let i = 0; i < 24; i++) {
          const ox = (Math.random() - 0.5) * 10;
          const oy = (Math.random() - 0.5) * 10;
          ctx.globalAlpha = 0.06;
          ctx.drawImage(cover, bgX + ox, bgY + oy, bgW, bgH);
        }
        ctx.globalAlpha = 1;
      }
    } catch {
      ctx.drawImage(cover, bgX, bgY, bgW, bgH);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundedRect(ctx, 0, 0, width, height, corner); ctx.fill();
  }

  // subtle stroke
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  roundedRect(ctx, 1, 1, width - 2, height - 2, corner - 1);
  ctx.stroke();

  // device label
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = fontDevice;
  ctx.textBaseline = 'top';
  ctx.fillText(device, padOuter, padOuter);

  // centered art
  const artX = Math.round((width - artSize) / 2);
  const artY = padOuter + 18;
  if (cover) drawRoundedImage(ctx, cover, artX, artY, artSize, artSize, 26);
  else { ctx.fillStyle = 'rgba(255,255,255,0.14)'; roundedRect(ctx, artX, artY, artSize, artSize, 26); ctx.fill(); }

  // title
  const textX = artX;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = fontTitle;
  ctx.textBaseline = 'alphabetic';
  const titleY = artY + artSize + 44;
  ctx.fillText(title, textX, titleY);

  // explicit badge
  if (explicit) {
    const tW = ctx.measureText(title).width;
    const bx = textX + tW + 8;
    const by = titleY - 16;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundedRect(ctx, bx, by, 16, 16, 3); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = '700 12px -apple-system, "SF Pro Text", "Segoe UI", Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('E', bx + 8, by + 8.5);
    ctx.textAlign = 'left';
  }

  // subtitle
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '500 16px -apple-system, "SF Pro Text", "Segoe UI", Arial';
  const subY = titleY + 26;
  ctx.fillText(sub, textX, subY);

  // progress
  const durationMs = track.duration_ms || 0;
  const durationSec = Math.max(0, Math.floor(durationMs / 1000));
  const posSec = Math.max(0, Math.min(durationSec, Math.floor(progressSec)));
  const remain = Math.max(0, durationSec - posSec);

  const barW = artSize;
  const barH = 3;
  const barX = textX;
  const barY = subY + 30;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundedRect(ctx, barX, barY, barW, barH, 2); ctx.fill();
  const filled = barW * (durationSec ? posSec / durationSec : 0);
  ctx.fillStyle = '#FFFFFF';
  roundedRect(ctx, barX, barY, Math.max(0, Math.min(barW, filled)), barH, 2); ctx.fill();

  // time labels
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 12px -apple-system, "SF Pro Text", "Segoe UI", Arial';
  ctx.textBaseline = 'top';
  ctx.fillText(formatTime(posSec), barX, barY + 8);
  ctx.textAlign = 'right';
  ctx.fillText(`-${formatTime(remain)}`, barX + barW, barY + 8);
  ctx.textAlign = 'left';

  // controls centered (▶ if paused, ⏸ if playing)
  const ctrY = barY + 56;
  drawControlsIOS(ctx, artX + artSize / 2, ctrY, paused);

  // airplay + volume
  const volY = ctrY + 60;
  drawAirplayIcon(ctx, textX, volY + 4, 18);
  drawVolumeSlider(ctx, textX + 28, volY, barW - 28, 0.55);

  // clip outer corners
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  roundedRect(ctx, 0, 0, width, height, corner);
  ctx.fill();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

/* ------------------------------ helpers ------------------------------ */

function roundedRect(ctx, x, y, w, h, r = 16) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoundedImage(ctx, img, x, y, w, h, r = 16) {
  ctx.save();
  roundedRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

async function safeLoad(url) { try { return await loadImage(url); } catch { return null; } }

async function dominantColor(img) {
  const w = 16, h = 16;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 8) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  if (!n) return { r: 18, g: 20, b: 22 };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/* ---------- UI bits (prev / play|pause / next / airplay) --------- */

function drawControlsIOS(ctx, centerX, y, paused = true) {
  const gap = 58;
  const sPrev = 22, sPlay = 28, sNext = 22;

  // Prev (◀◀)
  drawDoubleTriangle(ctx, centerX - gap, y, sPrev, false);

  // Center: Play if paused, Pause if playing
  if (paused) {
    // ▶
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    const playW = sPlay, playH = sPlay;
    ctx.moveTo(centerX - playW * 0.35, y - playH * 0.55);
    ctx.lineTo(centerX + playW * 0.55, y);
    ctx.lineTo(centerX - playW * 0.35, y + playH * 0.55);
    ctx.closePath();
    ctx.fill();
  } else {
    // ⏸ two rounded bars
    const barW = 8, barH = 28, r = 3, gapBars = 10;
    ctx.fillStyle = '#FFF';
    roundedRect(ctx, centerX - gapBars/2 - barW, y - barH/2, barW, barH, r); ctx.fill();
    roundedRect(ctx, centerX + gapBars/2, y - barH/2, barW, barH, r); ctx.fill();
  }

  // Next (▶▶)
  drawDoubleTriangle(ctx, centerX + gap, y, sNext, true);
}

function drawDoubleTriangle(ctx, cx, cy, size, right = true) {
  const w = size, h = size * 0.9, gap = 4;
  ctx.fillStyle = '#FFF';
  if (right) {
    triangle(ctx, cx - gap / 2 - 6, cy, w, h, true);
    triangle(ctx, cx + gap / 2, cy, w, h, true);
  } else {
    triangle(ctx, cx + gap / 2 + 6, cy, w, h, false);
    triangle(ctx, cx - gap / 2, cy, w, h, false);
  }
}

function triangle(ctx, cx, cy, w, h, right = true) {
  const dir = right ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(cx - (right ? -2 : 2), cy - h / 2);
  ctx.lineTo(cx + dir * w * 0.6, cy);
  ctx.lineTo(cx - (right ? -2 : 2), cy + h / 2);
  ctx.closePath();
  ctx.fill();
}

function drawAirplayIcon(ctx, x, y, size = 18) {
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  const w = size * 1.4, h = size * 0.9;
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  const tx = x + w / 2, ty = y + h + 2;
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - size * 0.5, ty + size * 0.7);
  ctx.lineTo(tx + size * 0.5, ty + size * 0.7);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
}

function drawVolumeSlider(ctx, x, y, w, ratio = 0.55) {
  const h = 4;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundedRect(ctx, x, y, w, h, 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  roundedRect(ctx, x, y, Math.max(6, Math.min(w, Math.floor(w * ratio))), h, 2); ctx.fill();
}
