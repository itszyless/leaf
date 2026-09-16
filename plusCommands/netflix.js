const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
  const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('netflix')
    .setDescription('Create a Netflix-style Now Playing card from a real show (no API key)')
    .addStringOption(o =>
      o.setName('query').setDescription('Show name (e.g., "Stranger Things", "The Witcher")').setRequired(true)
    )
    .addIntegerOption(o => o.setName('season').setDescription('Season number (optional)'))
    .addIntegerOption(o => o.setName('episode').setDescription('Episode number (optional)'))
    .addBooleanOption(o => o.setName('paused').setDescription('Paused badge (default false)')),
  category: 'Plus',

  async execute(interaction) {
    const query = interaction.options.getString('query').trim();
    const wantSeason = interaction.options.getInteger('season') || null;
    const wantEpisode = interaction.options.getInteger('episode') || null;
    const paused = interaction.options.getBoolean('paused') ?? false;

    try {
      const info = await lookupShow(query, { season: wantSeason, episode: wantEpisode });
      if (!info) return interaction.editReply({ content: `Couldn't find **${query}**.` });

      const buffer = await renderNetflix({
        title: info.title,
        subtitle: info.subtitle,
        rating: info.ratingBadge,
        posterUrl: info.posterUrl,
        backdropUrl: info.backdropUrl,
        total: info.totalSeconds,
        progress: Math.floor(info.totalSeconds * 0.32),
        paused
      });

      await interaction.editReply({ files: [{ attachment: buffer, name: 'now-playing.png' }] });
    } catch (e) {
      console.error('netflix error:', e);
      await interaction.editReply({ content: 'Failed to render that title. Try another show.' });
    }
  }
};

/* ---------------- TVMAZE (no key) ---------------- */

async function lookupShow(query, opts = {}) {
  const url = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(query)}&embed=episodes`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const show = await res.json();

  const title = show?.name || query;
  const ratingAvg = show?.rating?.average;
  const ratingBadge = ratingAvg ? `⭐ ${Number(ratingAvg).toFixed(1)}` : '';

  const posterUrl = show?.image?.original || show?.image?.medium || null;
  const backdropUrl = posterUrl;

  const eps = show?._embedded?.episodes || [];
  let picked = null;
  if (opts.season && opts.episode) {
    picked = eps.find(e => e.season === Number(opts.season) && e.number === Number(opts.episode)) || null;
  }
  if (!picked) picked = eps.find(e => e.season === 1 && e.number === 1) || eps[0] || null;

  let subtitle = '';
  let runtimeMins = show?.averageRuntime || show?.runtime || 45;
  if (picked) {
    runtimeMins = picked.runtime || runtimeMins || 45;
    subtitle = `S${picked.season} • E${picked.number}${picked.name ? ` — ${picked.name}` : ''}`;
  }

  return {
    title,
    subtitle,
    ratingBadge,
    posterUrl,
    backdropUrl,
    totalSeconds: Math.max(1, Number(runtimeMins || 45) * 60),
  };
}

/* ---------------- RENDERER ---------------- */

async function renderNetflix(opts) {
  const {
    title, subtitle = '', rating = '',
    posterUrl = null, backdropUrl = null,
    total = 3600, progress = 0, paused = false,
  } = opts;

  const W = 1280, H = 720;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  let bgImage = null, posterImage = null;
  if (backdropUrl) { try { bgImage = await loadImage(backdropUrl); } catch {} }
  if (posterUrl)   { try { posterImage = await loadImage(posterUrl); } catch {} }

  // ----- BACKGROUND (cover, never stretched) -----
  if (bgImage) {
    coverImage(ctx, bgImage, 0, 0, W, H);
    try { ctx.filter = 'blur(14px)'; coverImage(ctx, bgImage, 0, 0, W, H); } catch {}
    ctx.filter = 'none';
  } else if (posterImage) {
    const [r, g, b] = averageColor(posterImage);
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, `rgb(${r},${g},${b})`);
    grad.addColorStop(1, 'rgb(12,12,14)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1b1b1d'); g.addColorStop(1, '#111114');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // vignettes
  const vg = ctx.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,0.55)');
  vg.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  vg.addColorStop(1,  'rgba(0,0,0,0.80)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  // ----- LAYOUT SAFE AREA -----
  const P = 56;
  const rightColX = P + 420 + 48;            // poster (max 420) + gap
  const rightColW = W - P - rightColX;

  // ----- POSTER (keep real aspect, move slightly up) -----
  const targetH = Math.min(H - P*2, 560);
  let posterW = 420, posterH = targetH;
  let posterX = P, posterY = Math.round(H/2 - targetH/2) - 20; // <- 20px higher
  if (posterImage) {
    const ar = posterImage.width / posterImage.height;
    posterH = targetH;
    posterW = Math.round(posterH * ar);
    if (posterW > 420) { posterW = 420; posterH = Math.round(posterW / ar); }
    posterY = Math.max(P, Math.round(H/2 - posterH/2) - 20);  // keep up-shift
    drawRoundedImage(ctx, posterImage, posterX, posterY, posterW, posterH, 26, true);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 38; ctx.shadowOffsetY = 12;
    drawRoundedImage(ctx, posterImage, posterX, posterY, posterW, posterH, 26, true);
    ctx.restore();
  } else {
    ctx.fillStyle = '#26282c';
    roundRect(ctx, posterX, posterY, posterW, posterH, 26); ctx.fill();
  }

  // ----- TYPOGRAPHY (more spacing) -----
  const titleMax = rightColW;
  let titleSize = 84;
  ctx.font = `900 ${titleSize}px "Helvetica Neue", Arial, sans-serif`;
  while (ctx.measureText(title).width > titleMax && titleSize > 36) {
    titleSize -= 2; ctx.font = `900 ${titleSize}px "Helvetica Neue", Arial, sans-serif`;
  }

  let y = Math.max(P, posterY + 6); // align block with poster top
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';

  // Title
  ctx.fillText(title, rightColX, y);
  y += titleSize + 30; // <-- more space before rating

  // Rating line (single star + value)
  if (rating) {
    const starSize = 20;
    drawStar(ctx, rightColX, y + starSize/2 + 3, starSize, '#fff');
    ctx.font = `700 28px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(rating, rightColX + starSize + 12, y);
    y += 28 + 22; // extra breathing after rating
  }

  // Subtitle (episode)
  if (subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `500 36px "Helvetica Neue", Arial, sans-serif`;
    wrapFillText(ctx, subtitle, rightColX, y, rightColW, 44);
    y += 62;
  }

  // ----- TIMELINE -----
  const barW = W - P*2, barX = P, barY = H - 84, trackH = 10;
  ctx.font = `700 22px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(formatTime(progress), barX, barY - 28);
  ctx.textAlign = 'right'; ctx.fillText(formatTime(total), barX + barW, barY - 28); ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.26)'; roundRect(ctx, barX, barY, barW, trackH, trackH/2); ctx.fill();
  const fill = Math.max(0, Math.min(1, progress / total));
  const fillW = Math.max(6, Math.round(barW * fill));
  ctx.fillStyle = '#e50914'; roundRect(ctx, barX, barY, fillW, trackH, trackH/2); ctx.fill();
  const knobX = barX + fillW, knobR = 11;
  ctx.beginPath(); ctx.arc(knobX, barY + trackH/2, knobR, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(knobX, barY + trackH/2, knobR+6, 0, Math.PI*2); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2; ctx.stroke();

  // ----- CONTROLS (bigger, just above timeline, centered) -----
  const controlsY = barY - 56;                     // <- sits just above the bar
  const centerX = rightColX + rightColW / 2;
  const gap = 120;
  drawSkipBack(ctx, centerX - gap, controlsY, 42, '#fff');           // bigger
  if (paused) drawPlay(ctx, centerX, controlsY, 58, '#fff');
  else        drawPause(ctx, centerX, controlsY, 58, '#fff');
  drawSkipFwd(ctx, centerX + gap, controlsY, 42, '#fff');

  // Paused pill (optional)
  if (paused) {
    const txt = 'PAUSED';
    ctx.font = `800 18px "Helvetica Neue", Arial, sans-serif`;
    const w = Math.ceil(ctx.measureText(txt).width) + 18, h = 30;
    const bx = rightColX + rightColW - w, by = controlsY - 72;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, bx, by, w, h, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, bx + w/2, by + h/2); ctx.textAlign = 'left';
  }

  return canvas.toBuffer('image/png');
}

/* ---------------- Drawing utils ---------------- */

function coverImage(ctx, img, x, y, w, h) {
  const iw = img.width, ih = img.height; const ir = iw/ih, r = w/h;
  let dw, dh, dx, dy;
  if (ir > r) { dh = h; dw = dh * ir; dx = x + (w - dw)/2; dy = y; }
  else { dw = w; dh = dw / ir; dx = x; dy = y + (h - dh)/2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}
function drawRoundedImage(ctx, img, x, y, w, h, r = 20, cover = false) {
  ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
  if (cover) coverImage(ctx, img, x, y, w, h); else ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r = 12) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapFillText(ctx, text, x, y, maxWidth, lineH) {
  const words = String(text).split(/\s+/); let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width <= maxWidth) line = t;
    else { if (line) { ctx.fillText(line, x, y); y += lineH; } line = w; }
  }
  if (line) ctx.fillText(line, x, y);
}
function formatTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
}
function drawPlay(ctx, cx, cy, size, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(cx - size/2, cy - size/2); ctx.lineTo(cx + size/2, cy); ctx.lineTo(cx - size/2, cy + size/2);
  ctx.closePath(); ctx.fill();
}
function drawPause(ctx, cx, cy, size, color) {
  ctx.fillStyle = color; const barW = size*0.28, gap = size*0.2, h = size;
  ctx.fillRect(cx - gap/2 - barW, cy - h/2, barW, h); ctx.fillRect(cx + gap/2, cy - h/2, barW, h);
}
function drawSkipBack(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(cx + size*0.35, cy - size/2); ctx.lineTo(cx - size*0.35, cy); ctx.lineTo(cx + size*0.35, cy + size/2);
  ctx.closePath(); ctx.fill(); ctx.fillRect(cx - size*0.5, cy - size/2, size*0.12, size);
}
function drawSkipFwd(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(cx - size*0.35, cy - size/2); ctx.lineTo(cx + size*0.35, cy); ctx.lineTo(cx - size*0.35, cy + size/2);
  ctx.closePath(); ctx.fill(); ctx.fillRect(cx + size*0.38, cy - size/2, size*0.12, size);
}
function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  const pts = 5, step = Math.PI / pts;
  ctx.beginPath();
  for (let i = 0; i < 2*pts + 1; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI/2 + i * step;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}
function averageColor(img) {
  const c = createCanvas(10, 10); const ct = c.getContext('2d');
  ct.drawImage(img, 0, 0, 10, 10);
  const d = ct.getImageData(0, 0, 10, 10).data;
  let r=0,g=0,b=0, n=0;
  for (let i=0;i<d.length;i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
  return [ (r/n)|0, (g/n)|0, (b/n)|0 ];
}
