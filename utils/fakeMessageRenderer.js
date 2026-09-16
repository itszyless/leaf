const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const emojiRegex = require('emoji-regex');
const https = require('https');
const remoteImageAgent = new https.Agent({ rejectUnauthorized: false });
const fetchRemote = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const FONTS = registerDiscordFonts();
const TEXT_FONT = `${FONTS.regular}, "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif`;
const NAME_FONT = `${FONTS.semibold}, "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif`;
const VC_NAME_FONT = `${FONTS.medium}, "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif`;
const BADGE_ASSETS = {
  app: path.join(__dirname, '..', 'assets', 'fake-message', 'app.png'),
  verified_app: path.join(__dirname, '..', 'assets', 'fake-message', 'verified_app.png'),
  bot: path.join(__dirname, '..', 'assets', 'fake-message', 'bot.png'),
  verified_bot: path.join(__dirname, '..', 'assets', 'fake-message', 'verified_bot.png'),
};
const badgeCache = new Map();
const imageCache = new Map();
const boundsCache = new WeakMap();
const HEADER_GAP = 8;
const ITEM_GAP = 10;
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/';

const THEMES = {
  dark: { background: '#313338', name: '#f2f3f5', text: '#dbdee1', meta: '#949ba4', tagBg: '#3b3d44', tagText: '#f2f3f5', reactionBg: '#383a40', reactionBorder: '#383a40', reactionAddBg: '#383a40', reactionAddIcon: '#b5bac1', highlight: '#ff9f00', mentionBg: '#3b4270', mentionText: '#dee0fc' },
  ash: { background: '#2b2d31', name: '#f2f3f5', text: '#dbdee1', meta: '#949ba4', tagBg: '#383a40', tagText: '#f2f3f5', reactionBg: '#313338', reactionBorder: '#313338', reactionAddBg: '#313338', reactionAddIcon: '#b5bac1', highlight: '#ff9f00', mentionBg: '#343b6b', mentionText: '#d7dcff' },
  onyx: { background: '#1e1f22', name: '#f2f3f5', text: '#dbdee1', meta: '#949ba4', tagBg: '#2b2d31', tagText: '#f2f3f5', reactionBg: '#2b2d31', reactionBorder: '#2b2d31', reactionAddBg: '#2b2d31', reactionAddIcon: '#b5bac1', highlight: '#ff9f00', mentionBg: '#30365f', mentionText: '#d7dcff' },
  black: { background: '#000000', name: '#f2f3f5', text: '#f2f3f5', meta: '#949ba4', tagBg: '#2b2d31', tagText: '#f2f3f5', reactionBg: '#111214', reactionBorder: '#111214', reactionAddBg: '#111214', reactionAddIcon: '#b5bac1', highlight: '#ff9f00', mentionBg: '#26305f', mentionText: '#d7dcff' },
  light: { background: '#ffffff', name: '#060607', text: '#313338', meta: '#5c6067', tagBg: '#e3e5e8', tagText: '#313338', reactionBg: '#f2f3f5', reactionBorder: '#e3e5e8', reactionAddBg: '#f2f3f5', reactionAddIcon: '#969aa0', highlight: '#ff9f00', mentionBg: '#dbe2ff', mentionText: '#3451b2' },
};

function normalizeTheme(theme) {
  const key = String(theme || 'dark').trim().toLowerCase();
  return THEMES[key] ? key : 'dark';
}

function bool(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function registerDiscordFonts() {
  const root = path.join(__dirname, '..', 'fonts', 'gg-sans-font');
  const regular = path.join(root, 'gg sans Regular.ttf');
  const medium = path.join(root, 'gg sans Medium.ttf');
  const semibold = path.join(root, 'gg sans Semibold.ttf');

  try {
    if (fs.existsSync(regular)) GlobalFonts.registerFromPath(regular, 'GGSansRegular');
  } catch {}

  try {
    if (fs.existsSync(medium)) GlobalFonts.registerFromPath(medium, 'GGSansMedium');
  } catch {}

  try {
    if (fs.existsSync(semibold)) GlobalFonts.registerFromPath(semibold, 'GGSansSemibold');
  } catch {}

  return {
    regular: fs.existsSync(regular) ? 'GGSansRegular' : '"Segoe UI Variable Text"',
    medium: fs.existsSync(medium) ? 'GGSansMedium' : '"Segoe UI Variable Text"',
    semibold: fs.existsSync(semibold) ? 'GGSansSemibold' : (fs.existsSync(medium) ? 'GGSansMedium' : '"Segoe UI Variable Text"'),
  };
}

function displayTag(user, hideClanTags = false) {
  if (!user || hideClanTags) return '';
  const tag = user.primaryGuild?.tag || user.clan?.tag || user.guildTag || '';
  return String(tag || '').replace(/^#/, '').trim().slice(0, 12);
}

function displayBadge(user, badgeMode) {
  const mode = String(badgeMode || 'auto').toLowerCase().replace(/[\s-]+/g, '_');
  if (mode === 'none' || mode === 'false') return null;
  if (mode === 'app') return 'app';
  if (mode === 'bot') return 'bot';
  if (mode === 'verified' || mode === 'verified_app') return 'verified_app';
  if (mode === 'verified_bot') return 'verified_bot';
  if (user?.bot) return 'verified_app';
  return null;
}

function formatTime(timestamp) {
  if (timestamp) return String(timestamp).slice(0, 20);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
}

function emojiUrl(emoji) {
  const codepoints = Array.from(emoji)
    .map(char => char.codePointAt(0))
    .filter(code => code !== 0xfe0f && code !== 0x200d)
    .map(code => code.toString(16));
  return `${TWEMOJI_BASE}${codepoints.join('-')}.png`;
}

function customEmojiUrl(id) {
  return `https://cdn.discordapp.com/emojis/${id}.png?size=64&quality=lossless`;
}

function splitWordToken(word) {
  const parts = String(word || '').match(/@everyone|@here|<a?:[A-Za-z0-9_~]+:\d{15,25}>|<@!?\d{15,25}>|[^<]+|</g);
  return parts || [word];
}

function parseStyledRuns(input) {
  const source = String(input || '');
  const runs = [];
  const state = { bold: false, italic: false, underline: false, strike: false };
  let buffer = '';

  function flush() {
    if (!buffer) return;
    runs.push({ value: buffer, style: { ...state } });
    buffer = '';
  }

  for (let i = 0; i < source.length; i++) {
    if (source.startsWith('**', i)) { flush(); state.bold = !state.bold; i++; continue; }
    if (source.startsWith('~~', i)) { flush(); state.strike = !state.strike; i++; continue; }
    const ch = source[i];
    if (ch === '*') { flush(); state.italic = !state.italic; continue; }
    if (ch === '_') { flush(); state.underline = !state.underline; continue; }
    buffer += ch;
  }

  flush();
  return runs;
}

function richTextSegments(text, mentionMap = {}) {
  const sourceRuns = parseStyledRuns(text);
  const unicodeEmoji = emojiRegex();
  const tokenRegex = new RegExp('@everyone|@here|<a?:[A-Za-z0-9_~]+:\\d{15,25}>|<@!?\\d{15,25}>|' + unicodeEmoji.source + '|\\p{Extended_Pictographic}\\uFE0F?', 'gu');
  const segments = [];

  for (const run of sourceRuns) {
    let index = 0;
    let match;
    while ((match = tokenRegex.exec(run.value)) !== null) {
      if (match.index > index) segments.push({ type: 'text', value: run.value.slice(index, match.index), style: run.style });
      const token = match[0];
      const custom = token.match(/^<a?:([A-Za-z0-9_~]+):(\d{15,25})>$/);
      const mention = token.match(/^<@!?(\d{15,25})>$/);

      if (custom) segments.push({ type: 'customEmoji', name: custom[1], id: custom[2], style: run.style });
      else if (mention) segments.push({ type: 'mention', id: mention[1], label: mentionMap[mention[1]] || 'user', style: run.style });
      else if (token === '@everyone' || token === '@here') segments.push({ type: 'mention', id: token, label: token.slice(1), style: run.style });
      else segments.push({ type: 'emoji', value: token, style: run.style });
      index = match.index + token.length;
    }
    if (index < run.value.length) segments.push({ type: 'text', value: run.value.slice(index), style: run.style });
  }

  return segments;
}

function styledFont(baseFont, style = {}) {
  let font = String(baseFont || ('28px ' + TEXT_FONT));
  if (style.bold) {
    font = font
      .replaceAll(FONTS.regular, FONTS.semibold)
      .replaceAll('GGSansRegular', 'GGSansSemibold')
      .replaceAll('GGSansMedium', 'GGSansSemibold');
  }
  if (style.italic && !/^italic\s+/i.test(font)) font = 'italic ' + font;
  return font;
}

function measureSegment(ctx, segment, emojiSize, baseFont = ctx.font) {
  if (segment.type === 'emoji' || segment.type === 'customEmoji') return emojiSize;
  if (segment.type === 'mention') return ctx.measureText('@' + segment.label).width + 12;
  const oldFont = ctx.font;
  ctx.font = styledFont(baseFont, segment.style);
  const width = ctx.measureText(segment.value).width;
  ctx.font = oldFont;
  return width;
}

function measureRichText(ctx, text, emojiSize, mentionMap = {}) {
  const baseFont = ctx.font;
  return richTextSegments(text, mentionMap).reduce((width, segment) => width + measureSegment(ctx, segment, emojiSize, baseFont), 0);
}

function parseReactions(input) {
  const reactions = [];
  const parts = String(input || '').trim().split(/\s+/).filter(Boolean);

  for (const part of parts) {
    const spacedAmount = part.match(/^:(\d{1,6})$/);
    if (spacedAmount && reactions.length) {
      reactions[reactions.length - 1].count = Math.max(1, Math.min(999, Number(spacedAmount[1]) || 1));
      continue;
    }

    const amountMatch = part.match(/^(.*):(\d{1,6})$/);
    const emoji = (amountMatch ? amountMatch[1] : part).trim();
    const count = amountMatch ? Math.max(1, Math.min(999, Number(amountMatch[2]) || 1)) : 1;
    if (emoji) reactions.push({ emoji, count });
    if (reactions.length >= 5) break;
  }

  return reactions;
}

function reactionWidth(ctx, reaction) {
  ctx.font = `24px ${NAME_FONT}`;
  return Math.ceil(measureRichText(ctx, reaction.emoji, 25) + ctx.measureText(String(reaction.count)).width + 32);
}

async function drawReactionEmoji(ctx, emoji, x, y, colors) {
  await drawRichText(ctx, emoji, x, y, { font: `25px ${TEXT_FONT}`, fillStyle: colors.text, emojiSize: 25, colors });
}

function drawAddReactionIcon(ctx, x, y, color) {
  const icon = createCanvas(24, 24);
  const ictx = icon.getContext('2d');
  ictx.fillStyle = color;
  ictx.beginPath();
  ictx.arc(12, 12, 11, 0, Math.PI * 2);
  ictx.fill();
  ictx.globalCompositeOperation = 'destination-out';
  ictx.beginPath(); ictx.arc(6.5, 11.5, 1.5, 0, Math.PI * 2); ictx.fill();
  ictx.beginPath(); ictx.arc(17.5, 11.5, 1.5, 0, Math.PI * 2); ictx.fill();
  ictx.beginPath();
  ictx.moveTo(7.7, 14.17);
  ictx.bezierCurveTo(8.18, 13.86, 8.82, 13.98, 9.09, 14.44);
  ictx.bezierCurveTo(10.45, 16.42, 13.55, 16.42, 14.91, 14.44);
  ictx.bezierCurveTo(15.18, 13.98, 15.82, 13.86, 16.3, 14.17);
  ictx.bezierCurveTo(16.78, 14.49, 16.9, 15.12, 16.57, 15.56);
  ictx.bezierCurveTo(14.38, 18.8, 9.62, 18.8, 7.43, 15.56);
  ictx.bezierCurveTo(7.1, 15.12, 7.22, 14.49, 7.7, 14.17);
  ictx.fill();
  ctx.drawImage(icon, x, y, 24, 24);
}

async function drawRichText(ctx, text, x, y, options = {}) {
  const { font, fillStyle, emojiSize = 28, colors = THEMES.black, mentionMap = {} } = options;
  if (font) ctx.font = font;
  if (fillStyle) ctx.fillStyle = fillStyle;

  let currentX = x;
  for (const segment of richTextSegments(text, mentionMap)) {
    if (segment.type === 'emoji' || segment.type === 'customEmoji') {
      const url = segment.type === 'emoji' ? emojiUrl(segment.value) : customEmojiUrl(segment.id);
      const emoji = await loadCachedImage(url);
      if (emoji) ctx.drawImage(emoji, currentX, y - emojiSize + 2, emojiSize, emojiSize);
      currentX += emojiSize;
      continue;
    }

    if (segment.type === 'mention') {
      const label = '@' + segment.label;
      const oldFont = ctx.font;
      ctx.font = `28px ${TEXT_FONT}`;
      const width = ctx.measureText(label).width + 12;
      const pillHeight = 31;
      const pillY = y - 26;
      ctx.fillStyle = colors.mentionBg || '#3c4270';
      roundedRect(ctx, currentX, pillY, width, pillHeight, 4);
      ctx.fillStyle = colors.mentionText || '#b8c4ff';
      ctx.fillText(label, currentX + 6, y);
      ctx.font = oldFont;
      ctx.fillStyle = fillStyle || colors.text;
      currentX += width;
      continue;
    }

    const oldFont = ctx.font;
    const oldFill = ctx.fillStyle;
    ctx.font = styledFont(font || oldFont, segment.style);
    ctx.fillStyle = fillStyle || colors.text;
    const width = ctx.measureText(segment.value).width;
    ctx.fillText(segment.value, currentX, y);
    if (segment.style?.underline || segment.style?.strike) {
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (segment.style.underline) {
        ctx.moveTo(currentX, y + 5);
        ctx.lineTo(currentX + width, y + 5);
      }
      if (segment.style.strike) {
        ctx.moveTo(currentX, y - 11);
        ctx.lineTo(currentX + width, y - 11);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.font = oldFont;
    ctx.fillStyle = oldFill;
    currentX += width;
  }
}

function wrapText(ctx, text, maxWidth, emojiSize = 28, mentionMap = {}) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (measureRichText(ctx, test, emojiSize, mentionMap) <= maxWidth) { line = test; continue; }
    if (line) lines.push(line);
    if (measureRichText(ctx, word, emojiSize, mentionMap) <= maxWidth) { line = word; continue; }

    let chunk = '';
    for (const part of splitWordToken(word)) {
      const testChunk = chunk + part;
      if (measureRichText(ctx, testChunk, emojiSize, mentionMap) > maxWidth && chunk) { lines.push(chunk); chunk = part; }
      else chunk = testChunk;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

async function loadOptionalImage(url) {
  if (!url) return null;
  try {
    const value = String(url);
    if (/^https?:\/\//i.test(value)) {
      const res = await fetchRemote(value, { agent: remoteImageAgent, headers: { 'User-Agent': 'leaf/1.0' } });
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      return await loadImage(buffer);
    }
    return await loadImage(url);
  } catch {
    return null;
  }
}

async function loadCachedImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const promise = loadOptionalImage(url);
  imageCache.set(url, promise);
  return promise;
}

async function loadBadgeImage(kind) {
  if (!kind || !BADGE_ASSETS[kind]) return null;
  if (badgeCache.has(kind)) return badgeCache.get(kind);

  const promise = loadImage(BADGE_ASSETS[kind]).catch(() => null);
  badgeCache.set(kind, promise);
  return promise;
}

function imageBounds(image) {
  if (!image) return null;
  if (boundsCache.has(image)) return boundsCache.get(image);

  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (data[(y * image.width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const bounds = maxX >= 0
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { x: 0, y: 0, width: image.width, height: image.height };
  boundsCache.set(image, bounds);
  return bounds;
}

function badgeSize(image) {
  if (!image) return { width: 0, height: 0, bounds: null };
  const bounds = imageBounds(image);
  const height = 23;
  return { width: Math.round(bounds.width * (height / bounds.height)), height, bounds };
}

function voiceIconSvg(color) {
  const fill = String(color || '#8a8d92');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">' +
    '<g transform="translate(12 12) scale(1.08) translate(-12 -12)"><path fill="' + fill + '" d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z"/>' +
    '<path fill="' + fill + '" d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z"/></g>' +
    '</svg>';
  return Buffer.from(svg);
}

function fakeVcTheme(theme) {
  const key = normalizeTheme(theme);
  const base = THEMES[key];
  return {
    key,
    background: base.background,
    channel: key === 'light' ? '#5c6067' : '#949ba4',
    icon: key === 'light' ? '#6d6f78' : '#8b8d94',
    name: key === 'light' ? '#4e5058' : '#b5bac1',
    tagBg: base.tagBg,
    tagText: base.tagText,
  };
}

function safeChannelName(value) {
  const text = String(value || 'General').replace(/\s+/g, ' ').trim() || 'General';
  return text.slice(0, 30);
}

async function drawSmallAvatar(ctx, user, x, y, size) {
  const avatarUrl = user?.displayAvatarURL?.({ extension: 'png', size: 128, forceStatic: true });
  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, x, y, size, size);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#5865f2';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function renderFakeVc({ users = [], theme = 'dark', channel = 'General', useUsernames = false } = {}) {
  const colors = fakeVcTheme(theme);
  const visibleUsers = users.filter(entry => entry?.user).slice(0, 5);
  const avatarSize = 32;
  const topPad = 16;
  const channelY = 28;
  const firstUserY = 54;
  const rowH = 42;
  const bottomPad = 14;
  const left = 14;
  const userLeft = 44;
  const probe = createCanvas(10, 10);
  const pctx = probe.getContext('2d');
  const channelName = safeChannelName(channel);
  pctx.font = `22px ${VC_NAME_FONT}`;
  let widest = pctx.measureText(channelName).width + 44;
  const rows = [];

  for (const entry of visibleUsers) {
    const user = entry.user;
    const member = entry.member;
    const name = String(useUsernames ? user?.username : (member?.displayName || user?.globalName || user?.displayName || user?.username) || 'Unknown').slice(0, 40);
    const tag = (entry.clanTag?.tag || displayTag(user, false)).replace(/[\uFE0E\uFE0F]/g, '');
    const tagIcon = entry.clanTag?.imageUrl ? await loadCachedImage(entry.clanTag.imageUrl) : null;
    pctx.font = `20px ${VC_NAME_FONT}`;
    const nameW = measureRichText(pctx, name, 20);
    pctx.font = `13px ${NAME_FONT}`;
    const tagW = tag ? Math.min(125, pctx.measureText(tag).width + (tagIcon ? 36 : 20)) : 0;
    widest = Math.max(widest, userLeft + avatarSize + 8 + nameW + (tagW ? 8 + tagW : 0) + 18);
    rows.push({ ...entry, name, tag, tagIcon, tagW, nameW });
  }

  const count = Math.max(1, rows.length);
  const width = Math.ceil(Math.max(360, Math.min(820, widest + 12)));
  const height = Math.ceil(firstUserY + count * rowH + bottomPad - 2);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  const icon = await loadImage(voiceIconSvg(colors.icon)).catch(() => null);
  if (icon) ctx.drawImage(icon, left, topPad, 20, 20);
  ctx.font = `22px ${VC_NAME_FONT}`;
  ctx.fillStyle = colors.channel;
  ctx.fillText(channelName, left + 29, channelY + 6);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y = firstUserY + i * rowH;
    await drawSmallAvatar(ctx, row.user, userLeft, y, avatarSize);
    const nameX = userLeft + avatarSize + 9;
    ctx.font = `20px ${VC_NAME_FONT}`;
    ctx.fillStyle = colors.name;
    await drawRichText(ctx, row.name, nameX, y + 23, { font: `20px ${VC_NAME_FONT}`, fillStyle: colors.name, emojiSize: 20, colors });
    let nextX = nameX + row.nameW + 8;

    if (row.tag) {
      ctx.fillStyle = colors.tagBg;
      roundedRect(ctx, nextX, y + 5, row.tagW, 24, 7);
      let tagTextX = nextX + 9;
      if (row.tagIcon) {
        ctx.drawImage(row.tagIcon, nextX + 6, y + 9, 16, 16);
        tagTextX = nextX + 26;
      }
      ctx.font = `13px ${NAME_FONT}`;
      ctx.fillStyle = colors.tagText;
      ctx.fillText(row.tag, tagTextX, y + 21);
    }
  }

  return { buffer: canvas.toBuffer('image/png'), theme: colors.key };
}

async function renderFakeMessage({
  user,
  member,
  text,
  theme = 'black',
  displayFont,
  image,
  timestamp,
  mentionHighlight = false,
  reactions,
  toGif = false,
  useUsername = false,
  hideClanTags = false,
  appBadge = 'auto',
  clanTag = null,
  mentionMap = {},
}) {
  const key = normalizeTheme(theme);
  const colors = THEMES[key];
  const textFont = displayFont ? `${String(displayFont).slice(0, 50)}, ${TEXT_FONT}` : TEXT_FONT;
  const nameFont = displayFont ? `${String(displayFont).slice(0, 50)}, ${NAME_FONT}` : NAME_FONT;
  const cleanText = String(text || '').trim().slice(0, 1000) || 'My Text';
  const displayName = (useUsername ? user?.username : (member?.displayName || user?.globalName || user?.username) || 'Unknown User').slice(0, 40);
  const tag = (bool(hideClanTags) ? '' : (clanTag?.tag || displayTag(user, false))).replace(/[\uFE0E\uFE0F]/g, '');
  const tagIcon = clanTag?.imageUrl ? await loadCachedImage(clanTag.imageUrl) : null;
  const badge = displayBadge(user, appBadge);
  const badgeImage = await loadBadgeImage(badge);
  const badgeDraw = badgeSize(badgeImage);
  const time = formatTime(timestamp);
  const media = await loadOptionalImage(image);
  const reactionList = parseReactions(reactions);

  const probe = createCanvas(10, 10);
  const pctx = probe.getContext('2d');
  pctx.font = `28px ${textFont}`;
  const maxTextWidth = 980;
  const lines = wrapText(pctx, cleanText, maxTextWidth, 28, mentionMap);

  pctx.font = `27px ${nameFont}`;
  const nameWidth = measureRichText(pctx, displayName, 27);
  pctx.font = `17px ${nameFont}`;
  const tagWidth = tag ? Math.min(170, pctx.measureText(tag).width + (tagIcon ? 48 : 26)) : 0;
  const badgeWidth = badgeDraw.width;
  pctx.font = `22px ${textFont}`;
  const timeWidth = pctx.measureText(time).width;
  pctx.font = `28px ${textFont}`;
  const lineWidth = Math.max(...lines.map(line => measureRichText(pctx, line, 28, mentionMap)));

  const mediaW = media ? Math.min(420, media.width) : 0;
  const mediaH = media ? Math.round(media.height * (mediaW / media.width)) : 0;
  const reactionWidths = reactionList.map(reaction => reactionWidth(pctx, reaction));
  const reactionW = reactionList.length ? reactionWidths.reduce((sum, width) => sum + width, 0) + (reactionWidths.length - 1) * 8 + 54 : 0;
  const contentW = Math.max(nameWidth + tagWidth + badgeWidth + timeWidth + 54, lineWidth, mediaW, reactionW);
  const width = Math.ceil(Math.max(380, Math.min(1120, contentW + 156)));
  const textBottom = 88 + lines.length * 32;
  const mediaBottom = media ? textBottom + mediaH + 12 : textBottom;
  const reactionBottom = reactionList.length ? mediaBottom + 38 : mediaBottom;
  const height = Math.max(102, reactionBottom + 10);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  if (bool(mentionHighlight)) {
    ctx.fillStyle = colors.highlight;
    ctx.globalAlpha = key === 'light' ? 0.18 : 0.10;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff9f00';
    ctx.fillRect(0, 0, 3, height);
  }

  const avatarSize = 66;
  const avatarX = 28;
  const avatarY = 30;
  const avatarUrl = user?.displayAvatarURL?.({ extension: 'png', size: 256, forceStatic: true });
  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save(); ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize); ctx.restore();
  } catch {
    ctx.fillStyle = '#5865f2'; ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2); ctx.fill();
  }

  const x = 116;
  ctx.font = `27px ${nameFont}`;
  ctx.fillStyle = colors.name;
  await drawRichText(ctx, displayName, x, 55, { font: `27px ${nameFont}`, fillStyle: colors.name, emojiSize: 27 });
  let nextX = x + nameWidth + HEADER_GAP;

  if (tag) {
    ctx.fillStyle = colors.tagBg;
    roundedRect(ctx, nextX, 29, tagWidth, 30, 11);
    let tagTextX = nextX + 13;
    if (tagIcon) {
      ctx.drawImage(tagIcon, nextX + 8, 35, 18, 18);
      tagTextX = nextX + 32;
    }
    ctx.font = `17px ${nameFont}`;
    ctx.fillStyle = colors.tagText;
    ctx.fillText(tag, tagTextX, 50);
    nextX += tagWidth + ITEM_GAP;
  }

  if (badgeImage && badgeDraw.bounds) {
    const b = badgeDraw.bounds;
    ctx.drawImage(badgeImage, b.x, b.y, b.width, b.height, nextX, 35, badgeDraw.width, badgeDraw.height);
    nextX += badgeDraw.width + ITEM_GAP;
  }

  ctx.font = `22px ${textFont}`;
  ctx.fillStyle = colors.meta;
  ctx.fillText(time, nextX, 55);

  ctx.font = `28px ${textFont}`;
  ctx.fillStyle = colors.text;
  let y = 90;
  for (const line of lines) { await drawRichText(ctx, line, x, y, { font: `28px ${textFont}`, fillStyle: colors.text, emojiSize: 28, colors, mentionMap }); y += 32; }

  if (media) {
    const top = y - 20;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, top, mediaW, mediaH, 8); ctx.clip();
    ctx.drawImage(media, x, top, mediaW, mediaH);
    ctx.restore();
    y = top + mediaH + 12;
  }

  if (reactionList.length) {
    if (!media) y -= 19;
    let rx = x;
    for (let i = 0; i < reactionList.length; i++) {
      const reaction = reactionList[i];
      const rw = reactionWidths[i];
      ctx.fillStyle = colors.reactionBg;
      roundedRect(ctx, rx, y, rw, 36, 12);
      ctx.strokeStyle = colors.reactionBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      await drawReactionEmoji(ctx, reaction.emoji, rx + 10, y + 27, colors);
      ctx.font = `24px ${NAME_FONT}`;
      ctx.fillStyle = colors.text;
      ctx.fillText(String(reaction.count), rx + rw - ctx.measureText(String(reaction.count)).width - 12, y + 26);
      rx += rw + 8;
    }

    ctx.fillStyle = colors.reactionAddBg;
    roundedRect(ctx, rx, y, 44, 36, 12);
    drawAddReactionIcon(ctx, rx + 10, y + 6, colors.reactionAddIcon);
  }

  return { buffer: canvas.toBuffer(toGif ? 'image/png' : 'image/png'), theme: key };
}

module.exports = { renderFakeMessage, renderFakeVc, normalizeTheme };












