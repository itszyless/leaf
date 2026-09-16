const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const config = require('../config.json');
const { isPlusActive } = require('../utils/plusAccess');
const { Profile } = require('discord-arts');
const { abbreviate } = require('../utils/abbreviate');
const { authorizedCount } = require('../utils/appAuthorizations');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(__dirname, 'public');
const sessions = new Map();
const states = new Map();
const COOKIE = 'leaf_session';
const LANGUAGES = {
  en: 'English (Fastest)',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  nl: 'Dutch',
  pt: 'Portuguese',
  ru: 'Russian',
  tr: 'Turkish',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
};

function dashboardConfig() {
  const dash = config.Dashboard || {};
  const baseUrl = dash.BaseUrl || `http://localhost:${dash.Port || 3000}`;
  return {
    enabled: dash.Enabled !== false,
    host: dash.Host || '127.0.0.1',
    port: Number(dash.Port || 3000),
    baseUrl,
    redirectUri: dash.RedirectUri || `${baseUrl}/auth/discord/callback`,
    sessionSecret: dash.SessionSecret || localSessionSecret,
  };
}

const localSessionSecret = crypto.randomBytes(32).toString('hex');

function readJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8') || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function json(res, data, status = 200) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function sign(value) {
  return crypto.createHmac('sha256', dashboardConfig().sessionSecret).update(value).digest('hex');
}

function createSession(user) {
  const id = crypto.randomBytes(24).toString('hex');
  sessions.set(id, { user, createdAt: Date.now(), lastSeen: Date.now() });
  return `${id}.${sign(id)}`;
}

function getSession(req) {
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return null;
  const [id, sig] = raw.split('.');
  if (!id || sig !== sign(id)) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.createdAt > 604800000) { sessions.delete(id); return null; }
  session.lastSeen = Date.now();
  return { id, ...session };
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function setCookie(res, value) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${dashboardConfig().baseUrl.startsWith('https:') ? '; Secure' : ''}`);
}

function safeStaticPath(urlPath) {
  return confinedPath(publicDir, urlPath.replace(/^\/static\//, ''));
}

function confinedPath(directory, requestPath) {
  try {
    const full = path.resolve(directory, decodeURIComponent(requestPath));
    const relative = path.relative(directory, full);
    return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) ? full : null;
  } catch { return null; }
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.otf': 'font/otf', '.ttf': 'font/ttf', '.json': 'application/json; charset=utf-8',
  }[ext] || 'application/octet-stream';
}

function serveFile(res, file) {
  if (!file) return send(res, 404, 'Not found');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    send(res, 200, data, { 'Content-Type': mime(file), 'Cache-Control': 'no-store, max-age=0' });
  });
}

function botInviteUrl() {
  return config.OAuth2 || `https://discord.com/oauth2/authorize?client_id=${config.Bot_ID}&integration_type=1&scope=applications.commands`;
}

function isAdmin(userId) {
  const admins = readJson(path.join(rootDir, 'data', 'admins.json'), {});
  return String(userId) === String(config.Owner_ID) || admins[userId] === true;
}

function creatorUsername(bot, userId, sessionUser = null) {
  const id = String(userId || '');
  if (!id) return null;
  if (sessionUser && String(sessionUser.id) === id) return sessionUser.username || sessionUser.globalName || null;
  return bot?.users?.cache?.get(id)?.username || null;
}

function themeOwnerName(bot, userId, sessionUser = null) {
  const id = String(userId || '');
  if (!id) return null;
  return creatorUsername(bot, id, sessionUser) || id;
}
function savedThemesPath() { return path.join(rootDir, 'data', 'savedThemes.json'); }
function savedThemesFor(userId) { const saved = readJson(savedThemesPath(), {}); return Array.isArray(saved[userId]) ? saved[userId].map(String) : []; }
function saveThemeForUser(userId, themeId) { const saved = readJson(savedThemesPath(), {}); const list = Array.isArray(saved[userId]) ? saved[userId].map(String) : []; const id = String(themeId || ''); if (!id) return false; if (list.includes(id)) return false; saved[userId] = [id, ...list].slice(0, 100); writeJson(savedThemesPath(), saved); return true; }
function removeSavedThemeForUser(userId, themeId) { const saved = readJson(savedThemesPath(), {}); const list = Array.isArray(saved[userId]) ? saved[userId].map(String) : []; saved[userId] = list.filter(id => id !== String(themeId)); writeJson(savedThemesPath(), saved); }
function avatarHistorySettingsFor(userId) { const all = readJson(path.join(rootDir, 'data', 'avatarHistorySettings.json'), {}); return { public: all[userId]?.public !== false }; }

function userSettings(userId, bot = null, sessionUser = null) {
  const languages = readJson(path.join(rootDir, 'data', 'userLanguages.json'), {});
  const layouts = readJson(path.join(rootDir, 'data', 'userLayouts.json'), {});
  const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {});
  const savedThemeIds = savedThemesFor(userId);
  return {
    language: languages[userId] || 'en',
    layout: layouts[userId] || '',
    saved_themes: savedThemeIds,
    layouts: Object.entries(embedLayouts).map(([id, layout]) => ({
      id,
      name: layout.name || `Theme ${id}`,
      color: layout.color || '#424242',
      author: layout.author || {},
      footer: layout.footer || {},
      thumbnail: layout.thumbnail || null,
      creator_id: layout.creator_id || null,
      creator_name: creatorUsername(bot, layout.creator_id, sessionUser) || layout.creator_name || (layout.creator_id || null),
      uses: Number(layout.uses || 0),
      created_at: layout.created_at || null,
      public: layout.public !== false,
      saved: savedThemeIds.includes(String(id)),
    })),
    languages: LANGUAGES,
    plus: isPlusActive(userId),
    rank: rankSettingsFor(userId, sessionUser),
    general: {
      agent: agentSettingsFor(userId),
      dm: dmSettingsFor(userId),
      nsfw: nsfwSettingsFor(userId),
      avatarHistory: avatarHistorySettingsFor(userId),
    },
    nsfw: nsfwSettingsFor(userId),
  };
}

function cleanLayoutText(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function cleanLayoutUrl(value, fallback = null) {
  const raw = cleanLayoutText(value, 300);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return fallback && /^https?:\/\//i.test(String(fallback)) ? fallback : null;
}

function normalizeLayoutPayload(layout = {}, name = '') {
    const color = /^#[0-9a-f]{6}$/i.test(layout.color || '') ? layout.color : '#424242';
  const authorName = cleanLayoutText(layout.authorName ?? layout.author?.name, 32);
  const footerText = cleanLayoutText(layout.footerText ?? layout.footer?.text, 32);
  const authorIcon = authorName ? cleanLayoutUrl(layout.authorIcon ?? layout.author?.icon_url, null) : null;
  const footerIcon = footerText ? cleanLayoutUrl(layout.footerIcon ?? layout.footer?.icon_url, null) : null;
  const thumbnailUrl = cleanLayoutUrl(layout.thumbnail?.url ?? layout.thumbnail, null);
  return {
    name: cleanLayoutText(name || layout.name, 32) || 'leaf Theme',
    color,
    author: authorName ? { name: authorName, icon_url: authorIcon } : {},
    footer: footerText ? { text: footerText, icon_url: footerIcon } : {},
    thumbnail: thumbnailUrl ? { url: thumbnailUrl } : null,
  };
}

function layoutSignature(layout) {
  return JSON.stringify({
    color: String(layout.color || '').toLowerCase(),
    author: {
      name: layout.author?.name || '',
      icon_url: layout.author?.icon_url || '',
    },
    footer: {
      text: layout.footer?.text || '',
      icon_url: layout.footer?.icon_url || '',
    },
    thumbnail: layout.thumbnail?.url || null,
  });
}

function nextLayoutId(embedLayouts) {
  const nums = Object.keys(embedLayouts).map(id => Number(id)).filter(Number.isFinite);
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

function applyLayoutForUser(userId, layoutId) {
  const layouts = readJson(path.join(rootDir, 'data', 'userLayouts.json'), {});
  const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {});
  const nextLayout = String(layoutId || '');
  if (!embedLayouts[nextLayout]) return { ok: false, error: 'Theme not found.' };
  const oldLayout = String(layouts[userId] || '');
  if (oldLayout !== nextLayout) {
    if (oldLayout && embedLayouts[oldLayout]) {
      embedLayouts[oldLayout].uses = Math.max(0, Number(embedLayouts[oldLayout].uses || 0) - 1);
    }
    embedLayouts[nextLayout].uses = Number(embedLayouts[nextLayout].uses || 0) + 1;
    writeJson(path.join(rootDir, 'data', 'embedLayouts.json'), embedLayouts);
  }
  layouts[userId] = nextLayout;
  writeJson(path.join(rootDir, 'data', 'userLayouts.json'), layouts);
  return { ok: true, id: nextLayout };
}

function optionLabel(option) {
  const required = option.required ? '' : '?';
  return `<${option.name}${required}>`;
}

function normalizeCommandCategory(category) {
  const clean = String(category || 'Other').trim();
  if (/^utils?$/i.test(clean)) return 'Utility';
  if (/^plus$/i.test(clean)) return 'Utility';
  return clean || 'Other';
}

function inferCommandCategory(commandJson, category) {
  const name = String(commandJson?.name || '').toLowerCase();
  const clean = normalizeCommandCategory(category);
  if (clean !== 'Utility') return clean;
  const commandCategories = {
    fun: 'Fun',
    game: 'Games',
    games: 'Games',
    media: 'Media',
    eco: 'Economy',
    roblox: 'Roblox',
    discord: 'Utility',
    generate: 'Media',
    text: 'Utility',
    ai: 'AI',
    website: 'Utility',
    domain: 'Utility',
    convert: 'Utility',
    fortnite: 'Games',
    valorant: 'Games',
    steam: 'Utility',
    pets: 'Fun',
    account: 'Utility',
    lyrics: 'Fun',
    crypto: 'Utility',
    customize: 'Customize',
    enhancer: 'Customize',
    themes: 'Customize',
    topthemes: 'Customize',
    fakeban: 'Fun',
    fakenitro: 'Fun',
    nerdrate: 'Fun',
    netflix: 'Media',
    spotify: 'Media',
    timezone: 'Utility',
    weather: 'Utility',
    weatherforecast: 'Utility',
    'yt-summary': 'Media',
  };
  return commandCategories[name] || clean;
}

function isPremiumCommand(commandName, pathParts, rawCategory, description) {
  const commandPath = [commandName, ...pathParts].join(' ').toLowerCase();
  const desc = String(description || '');
  if (String(rawCategory || '').toLowerCase() === 'plus') return true;
  if (desc.charCodeAt(0) === 0x2728 || desc.startsWith('???') || desc.startsWith('?')) return true;
  return new Set([
    'website download',
    'eco monthlyplus',
    'eco monthlypremium',
  ]).has(commandPath);
}

function cleanCommandDescription(description) {
  let text = String(description || 'No description.');
  while (text.charCodeAt(0) === 0x2728 || text.startsWith('???') || text.startsWith('?')) {
    text = text.slice(text.startsWith('???') ? 3 : 1).trimStart();
  }
  return text;
}

function flattenCommand(commandJson, category, rawCategory) {
  const rows = [];
  const topOptions = Array.isArray(commandJson.options) ? commandJson.options : [];
  const subcommands = topOptions.filter(o => o.type === 1 || o.type === 2);
  const isContextMenu = commandJson.type === 2 || commandJson.type === 3;
  const base = {
    name: commandJson.name,
    category,
    premium: isPremiumCommand(commandJson.name, [], rawCategory, commandJson.description),
    description: isContextMenu ? (commandJson.type === 3 ? 'Message Context Menu' : 'User Context Menu') : cleanCommandDescription(commandJson.description),
    type: commandJson.type || 1,
  };

  function pushLeaf(pathParts, description, options = []) {
    const args = options.filter(o => o.type !== 1 && o.type !== 2);
    const label = [commandJson.name, ...pathParts].join(' ');
    const syntax = isContextMenu ? label : `/${label}${args.length ? ' ' + args.map(optionLabel).join(' ') : ''}`;
    const leafPremium = isPremiumCommand(commandJson.name, pathParts, rawCategory, description);
    rows.push({
      ...base,
      id: [commandJson.name, ...pathParts].join('-') || commandJson.name,
      displayName: isContextMenu ? label : `/${label}`,
      description: isContextMenu ? base.description : cleanCommandDescription(description || base.description),
      syntax,
      arguments: args.map(o => ({ name: o.name, description: o.description || 'No description.', required: Boolean(o.required), type: o.type })),
      premium: base.premium || leafPremium,
      contextMenu: isContextMenu,
    });
  }

  if (!subcommands.length) {
    pushLeaf([], commandJson.description, topOptions);
    return rows;
  }

  for (const option of subcommands) {
    if (option.type === 2) {
      for (const child of option.options || []) pushLeaf([option.name, child.name], child.description, child.options || []);
    } else {
      pushLeaf([option.name], option.description, option.options || []);
    }
  }
  return rows;
}

function commandCatalog(bot) {
  const rows = [];
  for (const command of bot.commands?.values?.() || []) {
    if (!command?.data?.toJSON || command.hidden) continue;
    const json = command.data.toJSON();
    const rawCategory = command.category || 'Other';
    const category = inferCommandCategory(json, rawCategory);
    rows.push(...flattenCommand(json, category, rawCategory));
  }
  rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return rows;
}

function getLevelFromXP(xp) {
  return Math.floor(0.2 * Math.sqrt(Number(xp || 0)));
}

function getXPForLevel(level) {
  return Math.floor((Number(level || 0) / 0.2) ** 2);
}

function defaultRankSettings() {
  return { card: true, background: null, visibility: 'everyone', showXP: true, showLevel: true };
}

function cleanRankSettings(value = {}) {
  return {
    card: value.card !== false,
    background: /^https?:\/\//i.test(String(value.background || '')) ? String(value.background).slice(0, 500) : null,
    visibility: value.visibility === 'private' ? 'private' : 'everyone',
    showXP: value.showXP !== false,
    showLevel: value.showLevel !== false,
  };
}

function getRankInfo(userId, sessionUser = null) {
  const xpData = readJson(path.join(rootDir, 'data', 'xp.json'), {});
  const admins = readJson(path.join(rootDir, 'data', 'admins.json'), {});
  const plus = readJson(path.join(rootDir, 'data', 'plusUsers.json'), {});
  const xp = Number(xpData[userId]?.xp || 0);
  const level = getLevelFromXP(xp);
  const currentXP = xp - getXPForLevel(level);
  const requiredXP = Math.max(1, getXPForLevel(level + 1) - getXPForLevel(level));
  const sorted = Object.entries(xpData).filter(([, v]) => typeof v?.xp === 'number').sort(([, a], [, b]) => b.xp - a.xp);
  const rank = sorted.findIndex(([id]) => String(id) === String(userId)) + 1 || 0;
  const title = String(userId) === String(config.Owner_ID) ? 'Owner' : admins[userId] ? 'Admin' : plus[userId] ? 'Plus' : 'User';
  return { xp, level, currentXP, requiredXP, rank, title, progressPercent: Math.round((currentXP / requiredXP) * 1000) / 10, username: sessionUser?.username || 'Discord User', displayName: sessionUser?.globalName || sessionUser?.username || 'Discord User', avatarUrl: discordAvatar(sessionUser || { id: userId }) };
}

function rankSettingsFor(userId, sessionUser = null) {
  const all = readJson(path.join(rootDir, 'data', 'rank-settings.json'), {});
  return { ...defaultRankSettings(), ...cleanRankSettings(all[userId] || {}), stats: getRankInfo(userId, sessionUser) };
}


function agentSettingsFor(userId) {
  const agents = readJson(path.join(rootDir, 'agents.json'), {});
  return { enabled: Object.prototype.hasOwnProperty.call(agents, userId) ? Boolean(agents[userId]) : true };
}

function dmSettingsFor(userId) {
  const dm = readJson(path.join(rootDir, 'data', 'DMSettings.json'), {});
  return { enabled: dm[userId] !== false };
}

function nsfwSettingsFor(userId) {
  const all = readJson(path.join(rootDir, 'data', 'nsfw.json'), {});
  return { enabled: Boolean(all[userId]?.enabled) };
}


function initEconomyUser(data, id) {
  if (!data[id]) data[id] = { cash: 0, bank: 0, lastDaily: 0, lastBonus: 0, lastMonthlyPlus: 0, joinedBonus: false };
  const row = data[id];
  if (typeof row.cash !== 'number') row.cash = 0;
  if (typeof row.bank !== 'number') row.bank = 0;
  if (typeof row.lastDaily !== 'number') row.lastDaily = 0;
  if (typeof row.lastBonus !== 'number') row.lastBonus = 0;
  if (typeof row.lastMonthlyPlus !== 'number') row.lastMonthlyPlus = 0;
  if (typeof row.lastDeposit !== 'number') row.lastDeposit = 0;
  if (typeof row.lastWithdraw !== 'number') row.lastWithdraw = 0;
  if (typeof row.joinedBonus !== 'boolean') row.joinedBonus = false;
  return row;
}
function prettyMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d) return d + 'd ' + h + 'h';
  if (h) return h + 'h ' + m + 'm';
  if (m) return m + 'm ' + s + 's';
  return s + 's';
}
function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return pad(d) + 'd ' + pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's';
}
function economyData(userId) {
  const ecoPath = path.join(rootDir, 'data', 'economy.json');
  const data = readJson(ecoPath, {});
  const row = initEconomyUser(data, userId);
  writeJson(ecoPath, data);
  const now = Date.now();
  const plus = isPlusActive(userId);
  const cooldown = (last, cd) => Math.max(0, cd - (now - Number(last || 0)));
  return {
    cash: row.cash,
    bank: row.bank,
    total: row.cash + row.bank,
    plus,
    joinedBonus: row.joinedBonus,
    cooldowns: { deposit: cooldown(row.lastDeposit, 1000), withdraw: cooldown(row.lastWithdraw, 1000) },
    claims: {
      joinbonus: { hidden: row.joinedBonus, ready: !row.joinedBonus, reward: 5000, remaining: 0, label: 'Join Bonus' },
      daily: { ready: cooldown(row.lastDaily, 86400000) <= 0, reward: plus ? 1000 : 500, remaining: cooldown(row.lastDaily, 86400000), remainingText: formatDuration(cooldown(row.lastDaily, 86400000)), label: 'Daily' },
      bonus: { ready: cooldown(row.lastBonus, 21600000) <= 0, reward: 'random', remaining: cooldown(row.lastBonus, 21600000), remainingText: formatDuration(cooldown(row.lastBonus, 21600000)), label: 'Bonus' },
      monthlyplus: { ready: plus && cooldown(row.lastMonthlyPlus, 2592000000) <= 0, locked: !plus, reward: 1000000, remaining: plus ? cooldown(row.lastMonthlyPlus, 2592000000) : 0, remainingText: plus ? formatDuration(cooldown(row.lastMonthlyPlus, 2592000000)) : '', label: 'Monthly Plus' },
    },
  };
}
function runEconomyAction(userId, body) {
  const ecoPath = path.join(rootDir, 'data', 'economy.json');
  const data = readJson(ecoPath, {});
  const row = initEconomyUser(data, userId);
  const now = Date.now();
  const plus = isPlusActive(userId);
  const action = String(body.action || '');
  const amount = Math.max(0, Math.floor(Number(body.amount || 0)));
  if (action === 'joinbonus') { if (row.joinedBonus) throw new Error('Join bonus already claimed.'); row.joinedBonus = true; row.cash += 5000; }
  else if (action === 'daily') { if (now - row.lastDaily < 86400000) throw new Error('Daily is still on cooldown.'); row.lastDaily = now; row.cash += plus ? 1000 : 500; }
  else if (action === 'bonus') { if (now - row.lastBonus < 21600000) throw new Error('Bonus is still on cooldown.'); row.lastBonus = now; row.cash += Math.floor(Math.random() * 900) + (plus ? 800 : 250); }
  else if (action === 'monthlyplus') { if (!plus) throw new Error('Monthly Plus requires Plus.'); if (now - row.lastMonthlyPlus < 2592000000) throw new Error('Monthly Plus is still on cooldown.'); row.lastMonthlyPlus = now; row.cash += 1000000; }
  else if (action === 'deposit') { if (now - row.lastDeposit < 1000) throw new Error('Deposit is on cooldown.'); if (amount <= 0 || amount > row.cash) throw new Error('Invalid deposit amount.'); row.cash -= amount; row.bank += amount; row.lastDeposit = now; }
  else if (action === 'withdraw') { if (now - row.lastWithdraw < 1000) throw new Error('Withdraw is on cooldown.'); if (amount <= 0 || amount > row.bank) throw new Error('Invalid withdraw amount.'); row.bank -= amount; row.cash += amount; row.lastWithdraw = now; }
  else throw new Error('Unknown economy action.');
  writeJson(ecoPath, data);
  return economyData(userId);
}

async function uploadImageToFreeHost(file) {
  const attempts = [
    async () => {
      const form = new FormData();
      form.append('file', new Blob([file.data], { type: file.contentType }), file.filename);
      const res = await fetch('https://0x0.st', { method: 'POST', body: form });
      if (!res.ok) throw new Error('0x0 failed');
      const text = (await res.text()).trim();
      if (!/^https?:\/\//i.test(text)) throw new Error('0x0 bad response');
      return text;
    },
    async () => {
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', new Blob([file.data], { type: file.contentType }), file.filename);
      const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
      if (!res.ok) throw new Error('catbox failed');
      const text = (await res.text()).trim();
      if (!/^https?:\/\//i.test(text)) throw new Error('catbox bad response');
      return text;
    },
    async () => {
      const form = new FormData();
      form.append('files[]', new Blob([file.data], { type: file.contentType }), file.filename);
      const res = await fetch('https://uguu.se/upload.php', { method: 'POST', body: form });
      if (!res.ok) throw new Error('uguu failed');
      const data = await res.json();
      const url = data?.files?.[0]?.url;
      if (!/^https?:\/\//i.test(url || '')) throw new Error('uguu bad response');
      return url;
    },
  ];
  let last;
  for (const run of attempts) {
    try { return await run(); } catch (err) { last = err; }
  }
  throw last || new Error('upload failed');
}

async function resolveRankBackground(background, userId) {
  if (!background) return path.join(rootDir, 'assets', 'levelbg.png');
  const raw = String(background || '');
  if (!/^https?:\/\//i.test(raw)) return raw;
  const cacheDir = path.join(rootDir, 'data', 'rank-bg-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const hash = crypto.createHash('sha1').update(raw).digest('hex');
  const prefix = String(userId || 'user') + '_' + hash + '.';
  const existing = fs.readdirSync(cacheDir).find(name => name.startsWith(prefix));
  if (existing) return path.join(cacheDir, existing);
  const res = await fetch(raw, { headers: { 'User-Agent': 'leafDashboard/1.0' } });
  if (!res.ok) return path.join(rootDir, 'assets', 'levelbg.png');
  const type = String(res.headers.get('content-type') || '');
  if (!/^image\//i.test(type)) return path.join(rootDir, 'assets', 'levelbg.png');
  const ext = type.includes('jpeg') || type.includes('jpg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png';
  const cached = path.join(cacheDir, prefix + ext);
  fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  return cached;
}

async function parseMultipartFile(req) {
  const type = String(req.headers['content-type'] || '');
  const boundary = type.match(/boundary=([^;]+)/)?.[1];
  if (!boundary) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw new Error('Image upload exceeds 10 MiB');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const marker = Buffer.from('--' + boundary);
  const parts = [];
  let start = raw.indexOf(marker);
  while (start !== -1) {
    const next = raw.indexOf(marker, start + marker.length);
    if (next === -1) break;
    parts.push(raw.slice(start + marker.length + 2, next - 2));
    start = next;
  }
  for (const part of parts) {
    const sep = part.indexOf(Buffer.from('\r\n\r\n'));
    if (sep === -1) continue;
    const headers = part.slice(0, sep).toString('utf8');
    if (!/filename=/i.test(headers)) continue;
    const contentType = headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';
    const filename = headers.match(/filename="([^"]*)"/i)?.[1] || 'image.png';
    return { filename, contentType, data: part.slice(sep + 4) };
  }
  return null;
}

function stats(bot) {
  const topLevel = Array.from(bot.commands?.values?.() || []).filter(command => command?.data?.toJSON && !command.hidden).length;
  const actions = commandCatalog(bot).length;
  const users = Math.max(authorizedCount(), bot.users?.cache?.filter?.(u => !u.bot)?.size || 0);
  return { online: Boolean(bot.isReady?.()), users, guilds: bot.guilds?.cache?.size || 0, commands: topLevel, actions, reactionMs: Math.max(1, Math.round(bot.ws?.ping || 15)) };
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Request body exceeds 1 MiB');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function exchangeCode(code) {
  const dash = dashboardConfig();
  const body = new URLSearchParams({ client_id: config.Bot_ID, client_secret: config.Client_Secret, grant_type: 'authorization_code', code, redirect_uri: dash.redirectUri });
  const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!tokenRes.ok) throw new Error('Token exchange failed: ' + tokenRes.status);
  const token = await tokenRes.json();
  const userRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: 'Bearer ' + token.access_token } });
  if (!userRes.ok) throw new Error('User fetch failed: ' + userRes.status);
  const user = await userRes.json();
  return { id: user.id, username: user.username, globalName: user.global_name, avatar: user.avatar, discriminator: user.discriminator };
}

function discordAvatar(user) {
  if (!user?.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id || '0') >> 22n) % 6n)}.png`;
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
}

async function fetchDiscordUserProfile(userId) {
  if (!userId || !config.Token) return null;
  const res = await fetch(`https://discord.com/api/v10/users/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bot ${config.Token}` } }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

function discordCdnAvatar(user) {
  if (!user?.avatar) return null;
  const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
}

function discordCdnBanner(user) {
  if (!user?.banner) return null;
  const ext = String(user.banner).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=1024`;
}

async function teamData(bot) {
  const ownerId = String(config.Owner_ID || '');
  let apiUser = await fetchDiscordUserProfile(ownerId);
  let clientUser = null;
  try { clientUser = await bot.users.fetch(ownerId, { force: true }); if (typeof clientUser.fetch === 'function') clientUser = await clientUser.fetch(true).catch(() => clientUser); } catch {}
  const avatar = discordCdnAvatar(apiUser) || clientUser?.displayAvatarURL?.({ size: 256, extension: 'png' }) || '/assets/leaf_no_bg.png';
  const banner = discordCdnBanner(apiUser) || clientUser?.bannerURL?.({ size: 1024, extension: 'png' }) || null;
  const accent = apiUser?.accent_color ? '#' + Number(apiUser.accent_color).toString(16).padStart(6, '0') : '#424242';
  return { members: [{ id: ownerId, name: apiUser?.global_name || clientUser?.globalName || clientUser?.displayName || apiUser?.username || clientUser?.username || 'zyless', username: apiUser?.username || clientUser?.username || 'zyless', role: 'Owner & Developer', avatar, banner, accent }] };
}

function routePage(res) { return serveFile(res, path.join(publicDir, 'index.html')); }

function startDashboard(bot) {
  const dash = dashboardConfig();
  if (!dash.enabled) return null;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, dash.baseUrl);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== new URL(dash.baseUrl).origin) {
        return json(res, { error: 'Same-origin request required.' }, 403);
      }
      const hostName = String(req.headers.host || '').split(':')[0].toLowerCase();
      if (hostName === 'support.localhost' || hostName === 'support.leafbot.net') {
        res.writeHead(302, { Location: config.SupportServer || '/' });
        return res.end();
      }
      const session = getSession(req);
      if (url.pathname.startsWith('/static/')) return serveFile(res, safeStaticPath(url.pathname));
      if (url.pathname.startsWith('/assets/')) return serveFile(res, confinedPath(path.join(rootDir, 'assets'), url.pathname.slice(8)));
      if (url.pathname.startsWith('/fonts/')) return serveFile(res, confinedPath(path.join(rootDir, 'fonts'), url.pathname.slice(7)));
      if (url.pathname === '/favicon.ico') return serveFile(res, path.join(rootDir, 'assets', 'leaf_no_bg.png'));
      if (url.pathname === '/invite') { res.writeHead(302, { Location: botInviteUrl() }); return res.end(); }
      if (url.pathname === '/auth/discord') { if (!config.Bot_ID || !config.Client_Secret) return send(res, 503, 'Discord login needs Bot_ID and Client_Secret in config.json.'); const state = crypto.randomBytes(16).toString('hex'); for (const [key, created] of states) if (Date.now() - created > 600000) states.delete(key); states.set(state, Date.now()); res.setHeader('Set-Cookie', `leaf_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${dash.baseUrl.startsWith('https:') ? '; Secure' : ''}`); const auth = new URL('https://discord.com/oauth2/authorize'); auth.searchParams.set('client_id', config.Bot_ID); auth.searchParams.set('redirect_uri', dash.redirectUri); auth.searchParams.set('response_type', 'code'); auth.searchParams.set('scope', 'identify'); auth.searchParams.set('state', state); res.writeHead(302, { Location: auth.toString() }); return res.end(); }
      if (url.pathname === '/auth/discord/callback') { const code = url.searchParams.get('code'); const state = url.searchParams.get('state'); if (!code || !state || !states.has(state) || Date.now() - states.get(state) > 600000 || parseCookies(req).leaf_oauth_state !== state) return send(res, 400, 'Invalid OAuth state.'); states.delete(state); const user = await exchangeCode(code); setCookie(res, createSession(user)); res.writeHead(302, { Location: '/settings' }); return res.end(); }
      if (url.pathname === '/logout') { if (session) sessions.delete(session.id); clearCookie(res); res.writeHead(302, { Location: '/' }); return res.end(); }
      if (url.pathname === '/api/bootstrap') return json(res, { app: { name: 'leaf', version: config.Version, support: config.SupportServer, invite: botInviteUrl() }, stats: stats(bot), me: session ? { ...session.user, avatarUrl: discordAvatar(session.user), admin: isAdmin(session.user.id) } : null });
      if (url.pathname === '/api/commands') return json(res, { commands: commandCatalog(bot), stats: stats(bot) });
      if (url.pathname === '/api/team') return json(res, await teamData(bot));
      if (url.pathname === '/api/me') return json(res, session ? { user: { ...session.user, avatarUrl: discordAvatar(session.user), admin: isAdmin(session.user.id) }, settings: userSettings(session.user.id, bot, session.user) } : { user: null });
      if (url.pathname === '/api/level-preview.png') { if (!session) return send(res, 401, 'Login required.', { 'Content-Type': 'text/plain' }); const stored = rankSettingsFor(session.user.id, session.user); const previewSettings = cleanRankSettings({ ...stored, card: url.searchParams.get('card') !== 'false', background: url.searchParams.get('background') || stored.background, visibility: url.searchParams.get('visibility') || stored.visibility, showXP: url.searchParams.get('showXP') !== 'false', showLevel: url.searchParams.get('showLevel') !== 'false' }); const info = getRankInfo(session.user.id, session.user); const bg = await resolveRankBackground(previewSettings.background, session.user.id); const badges = []; if (isPlusActive(session.user.id) && fs.existsSync(path.join(rootDir, 'assets', 'badges', 'Plus.png'))) badges.push(path.join(rootDir, 'assets', 'badges', 'Plus.png')); if (isAdmin(session.user.id) && fs.existsSync(path.join(rootDir, 'assets', 'badges', 'Admin.png'))) badges.push(path.join(rootDir, 'assets', 'badges', 'Admin.png')); if (String(session.user.id) === String(config.Owner_ID) && fs.existsSync(path.join(rootDir, 'assets', 'badges', 'Owner.png'))) badges.push(path.join(rootDir, 'assets', 'badges', 'Owner.png')); const buffer = await Profile(session.user.id, { customBadges: badges, customUsername: session.user.username, usernameColor: '#ffffff', squareAvatar: false, presenceStatus: 'online', badgesFrame: true, customDate: info.title, customBackground: bg, moreBackgroundBlur: true, backgroundBrightness: 25, customTag: 'Level Progress', customSubtitle: previewSettings.showXP ? (abbreviate(info.currentXP, 'prefix') + ' / ' + abbreviate(info.requiredXP, 'prefix') + ' XP') : 'XP Hidden', rankData: { currentXp: previewSettings.showXP ? info.currentXP : 0, requiredXp: previewSettings.showXP ? info.requiredXP : 1, rank: info.rank, level: previewSettings.showLevel ? info.level : 0, barColor: config.Level_Bar_Color || '#424242', levelColor: '#ada8c6', autoColorRank: true, hideXp: !previewSettings.showXP, hideLevel: !previewSettings.showLevel } }); return send(res, 200, buffer, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); }
      if (url.pathname === '/api/upload-image') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const file = await parseMultipartFile(req); if (!file || !/^image\//i.test(file.contentType)) return json(res, { error: 'Upload an image file.' }, 400); const link = await uploadImageToFreeHost(file); return json(res, { url: link }); }

      if (url.pathname === '/api/economy') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method === 'GET') return json(res, economyData(session.user.id)); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); try { const body = await readBody(req); return json(res, runEconomyAction(session.user.id, body)); } catch (err) { return json(res, { error: err.message || 'Economy action failed.' }, 400); } }
      if (url.pathname === '/api/settings') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method === 'GET') return json(res, userSettings(session.user.id, bot, session.user)); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); const settings = userSettings(session.user.id, bot, session.user); if (body.language && settings.languages[body.language]) { const languages = readJson(path.join(rootDir, 'data', 'userLanguages.json'), {}); languages[session.user.id] = body.language; writeJson(path.join(rootDir, 'data', 'userLanguages.json'), languages); } if (body.rankReset === true) { const ranks = readJson(path.join(rootDir, 'data', 'rank-settings.json'), {}); delete ranks[session.user.id]; writeJson(path.join(rootDir, 'data', 'rank-settings.json'), ranks); } if (body.rank && typeof body.rank === 'object') { const ranks = readJson(path.join(rootDir, 'data', 'rank-settings.json'), {}); ranks[session.user.id] = cleanRankSettings({ ...defaultRankSettings(), ...(ranks[session.user.id] || {}), ...body.rank }); writeJson(path.join(rootDir, 'data', 'rank-settings.json'), ranks); } if (body.general && typeof body.general === 'object') { if (body.general.agent && Object.prototype.hasOwnProperty.call(body.general.agent, 'enabled')) { const agents = readJson(path.join(rootDir, 'agents.json'), {}); agents[session.user.id] = Boolean(body.general.agent.enabled); writeJson(path.join(rootDir, 'agents.json'), agents); } if (body.general.dm && Object.prototype.hasOwnProperty.call(body.general.dm, 'enabled')) { const dm = readJson(path.join(rootDir, 'data', 'DMSettings.json'), {}); dm[session.user.id] = Boolean(body.general.dm.enabled); writeJson(path.join(rootDir, 'data', 'DMSettings.json'), dm); } if (body.general.nsfw && Object.prototype.hasOwnProperty.call(body.general.nsfw, 'enabled')) { const nsfw = readJson(path.join(rootDir, 'data', 'nsfw.json'), {}); nsfw[session.user.id] = { enabled: Boolean(body.general.nsfw.enabled) }; writeJson(path.join(rootDir, 'data', 'nsfw.json'), nsfw); } if (body.general.avatarHistory && Object.prototype.hasOwnProperty.call(body.general.avatarHistory, 'enabled')) { const avatar = readJson(path.join(rootDir, 'data', 'avatarHistorySettings.json'), {}); avatar[session.user.id] = { public: Boolean(body.general.avatarHistory.enabled) }; writeJson(path.join(rootDir, 'data', 'avatarHistorySettings.json'), avatar); } } if (Object.prototype.hasOwnProperty.call(body, 'layout')) { const layouts = readJson(path.join(rootDir, 'data', 'userLayouts.json'), {}); const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {}); const oldLayout = String(layouts[session.user.id] || ''); if (!body.layout) { if (oldLayout && embedLayouts[oldLayout]) { embedLayouts[oldLayout].uses = Math.max(0, Number(embedLayouts[oldLayout].uses || 0) - 1); writeJson(path.join(rootDir, 'data', 'embedLayouts.json'), embedLayouts); } delete layouts[session.user.id]; } else if (embedLayouts[body.layout]) { const nextLayout = String(body.layout); if (oldLayout !== nextLayout) { if (oldLayout && embedLayouts[oldLayout]) embedLayouts[oldLayout].uses = Math.max(0, Number(embedLayouts[oldLayout].uses || 0) - 1); embedLayouts[nextLayout].uses = Number(embedLayouts[nextLayout].uses || 0) + 1; writeJson(path.join(rootDir, 'data', 'embedLayouts.json'), embedLayouts); } layouts[session.user.id] = nextLayout; } writeJson(path.join(rootDir, 'data', 'userLayouts.json'), layouts); } return json(res, { ok: true, settings: userSettings(session.user.id, bot, session.user) }); }
      if (url.pathname === '/api/layouts/apply') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); const result = applyLayoutForUser(session.user.id, body.id); if (!result.ok) return json(res, result, 404); saveThemeForUser(session.user.id, body.id); return json(res, { ok: true, settings: userSettings(session.user.id, bot, session.user) }); }
      if (url.pathname === '/api/layouts/save-existing') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {}); const id = String(body.id || ''); if (!embedLayouts[id]) return json(res, { error: 'Theme not found.' }, 404); const added = saveThemeForUser(session.user.id, id); if (!added && !body.apply) return json(res, { error: 'saved_already', message: 'Theme saved already.' }, 409); if (body.apply) applyLayoutForUser(session.user.id, id); return json(res, { ok: true, existing: !added, settings: userSettings(session.user.id, bot, session.user) }); }
      if (url.pathname === '/api/layouts/remove-saved') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); removeSavedThemeForUser(session.user.id, body.id); return json(res, { ok: true, settings: userSettings(session.user.id, bot, session.user) }); }
      if (url.pathname === '/api/layouts/save') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {}); const normalized = normalizeLayoutPayload(body.layout || {}, body.name); const sig = layoutSignature(normalized); const duplicate = Object.entries(embedLayouts).find(([, layout]) => layoutSignature(layout) === sig); if (duplicate) { const [id, layout] = duplicate; if (String(layout.creator_id || '') === String(session.user.id) || savedThemesFor(session.user.id).includes(String(id))) return json(res, { error: 'saved_already', id, message: 'Theme saved already.' }, 409); return json(res, { error: 'duplicate_layout', id, message: 'Theme id: #' + id + ' uses this theme already.' }, 409); } const id = nextLayoutId(embedLayouts); embedLayouts[id] = { ...normalized, creator_id: session.user.id, creator_name: session.user.username, uses: 0, public: false, created_at: new Date().toISOString() }; writeJson(path.join(rootDir, 'data', 'embedLayouts.json'), embedLayouts); saveThemeForUser(session.user.id, id); if (body.apply) applyLayoutForUser(session.user.id, id); return json(res, { ok: true, id, settings: userSettings(session.user.id, bot, session.user) }); }
      if (url.pathname === '/api/layouts/update') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {}); const id = String(body.id || ''); const current = embedLayouts[id]; if (!current) return json(res, { error: 'Theme not found.' }, 404); if (String(current.creator_id || '') !== String(session.user.id)) return json(res, { error: 'You can only edit your own themes.' }, 403); embedLayouts[id] = { ...current, ...normalizeLayoutPayload(body.layout || current, current.name), creator_id: current.creator_id, creator_name: current.creator_name || session.user.username, uses: Number(current.uses || 0), public: current.public === true, created_at: current.created_at || new Date().toISOString(), updated_at: new Date().toISOString() }; writeJson(path.join(rootDir, 'data', 'embedLayouts.json'), embedLayouts); if (body.apply) applyLayoutForUser(session.user.id, id); return json(res, { ok: true, settings: userSettings(session.user.id, bot, session.user) }); }
      if (url.pathname === '/api/layouts/rename') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {}); const id = String(body.id || ''); if (!embedLayouts[id]) return json(res, { error: 'Theme not found.' }, 404); if (String(embedLayouts[id].creator_id || '') !== String(session.user.id)) return json(res, { error: 'You can only rename your own themes.' }, 403); embedLayouts[id].name = cleanLayoutText(body.name, 32) || embedLayouts[id].name; writeJson(path.join(rootDir, 'data', 'embedLayouts.json'), embedLayouts); return json(res, { ok: true, settings: userSettings(session.user.id, bot, session.user) }); }
      if (url.pathname === '/api/layouts/upload') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {}); const id = String(body.id || ''); if (!embedLayouts[id]) return json(res, { error: 'Theme not found.' }, 404); if (String(embedLayouts[id].creator_id || '') !== String(session.user.id)) return json(res, { error: 'You can only upload your own themes.' }, 403); embedLayouts[id].public = !embedLayouts[id].public; if (embedLayouts[id].public) embedLayouts[id].uploaded_at = new Date().toISOString(); else embedLayouts[id].unpublished_at = new Date().toISOString(); writeJson(path.join(rootDir, 'data', 'embedLayouts.json'), embedLayouts); return json(res, { ok: true, public: embedLayouts[id].public, settings: userSettings(session.user.id, bot, session.user) }); }
      if (url.pathname === '/api/layouts/delete') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {}); const id = String(body.id || ''); const layout = embedLayouts[id]; if (!layout) return json(res, { error: 'Theme not found.' }, 404); if (String(layout.creator_id || '') !== String(session.user.id)) return json(res, { error: 'You can only delete your own themes.' }, 403); if (String(body.name || '') !== String(layout.name || '')) return json(res, { error: 'Theme name did not match.' }, 400); delete embedLayouts[id]; writeJson(path.join(rootDir, 'data', 'embedLayouts.json'), embedLayouts); const userLayouts = readJson(path.join(rootDir, 'data', 'userLayouts.json'), {}); for (const [uid, lid] of Object.entries(userLayouts)) if (String(lid) === id) delete userLayouts[uid]; writeJson(path.join(rootDir, 'data', 'userLayouts.json'), userLayouts); const saved = readJson(savedThemesPath(), {}); for (const uid of Object.keys(saved)) if (Array.isArray(saved[uid])) saved[uid] = saved[uid].map(String).filter(x => x !== id); writeJson(savedThemesPath(), saved); return json(res, { ok: true, settings: userSettings(session.user.id, bot, session.user) }); }
      if (url.pathname === '/api/layouts/share') { if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); const body = await readBody(req); const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {}); const id = String(body.id || ''); if (!embedLayouts[id]) return json(res, { error: 'Theme not found.' }, 404); if (String(embedLayouts[id].creator_id || '') !== String(session.user.id)) return json(res, { error: 'You can only share your own themes.' }, 403); const sharesPath = path.join(rootDir, 'data', 'themeShares.json'); const shares = readJson(sharesPath, {}); const token = crypto.randomBytes(18).toString('hex'); shares[token] = { id, creator_id: session.user.id, created_at: Date.now(), used: false }; writeJson(sharesPath, shares); return json(res, { ok: true, url: dash.baseUrl.replace(/\/$/, '') + '/theme/' + token }); }
      if (url.pathname.startsWith('/api/theme-share/')) { const token = url.pathname.split('/').pop(); const sharesPath = path.join(rootDir, 'data', 'themeShares.json'); const shares = readJson(sharesPath, {}); const share = shares[token]; const embedLayouts = readJson(path.join(rootDir, 'data', 'embedLayouts.json'), {}); if (!share || share.used || !embedLayouts[share.id]) return json(res, { error: 'Theme share link is invalid or already used.' }, 404); if (req.method === 'GET') return json(res, { ok: true, theme: { id: share.id, ...embedLayouts[share.id], creator_name: themeOwnerName(bot, embedLayouts[share.id].creator_id, session?.user || null) } }); if (!session) return json(res, { error: 'Login required.' }, 401); if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405); saveThemeForUser(session.user.id, share.id); shares[token].used = true; shares[token].used_by = session.user.id; shares[token].used_at = Date.now(); writeJson(sharesPath, shares); return json(res, { ok: true, settings: userSettings(session.user.id, bot, session.user) }); }
      return routePage(res);
    } catch (err) { console.error('[dashboard]', err); return json(res, { error: 'Dashboard error.' }, 500); }
  });
  server.on('error', error => { console.error(`Dashboard could not listen on ${dash.host}:${dash.port} (${error.code}).`); process.exitCode = 1; });
  server.listen(dash.port, dash.host, () => console.log(`Dashboard running at ${dash.baseUrl}`));
  return server;
}

module.exports = { startDashboard, confinedPath };

