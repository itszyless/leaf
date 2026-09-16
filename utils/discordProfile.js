const config = require('../config.json');

const CACHE_MS = 10 * 60 * 1000;
const DEBUG_PROFILE = false;
const cache = new Map();

function botToken() {
  return String(config.Token || '').trim().replace(/^Bot\s+/i, '');
}

function debugProfile(...args) {
  if (DEBUG_PROFILE) console.log('[discord-profile]', ...args);
}

function normalizePrimaryGuild(primaryGuild) {
  if (!primaryGuild) return null;

  const guildId = primaryGuild.identity_guild_id || primaryGuild.identityGuildId || primaryGuild.guild_id || primaryGuild.guildId;
  const badge = primaryGuild.badge || primaryGuild.badge_hash || primaryGuild.badgeHash;
  const tag = String(primaryGuild.tag || '').trim().slice(0, 12);
  const enabled = primaryGuild.identity_enabled;

  if (enabled === false || !guildId || !badge || !tag) return null;

  return {
    guildId,
    badge,
    tag,
    imageUrl: `https://cdn.discordapp.com/guild-tag-badges/${guildId}/${badge}.png`,
  };
}

async function readBody(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function fetchDiscordClanTag(userId) {
  if (!userId || typeof fetch !== 'function') return null;

  if (!DEBUG_PROFILE) {
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.time < CACHE_MS) return cached.value;
  }

  try {
    const token = botToken();
    if (!token) return null;

    const res = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    const body = await readBody(res);

    debugProfile(`bot GET /users/${userId} -> ${res.status} ${res.statusText}`);
    debugProfile('bot response:', JSON.stringify(body, null, 2));

    if (!res.ok) return null;
    const value = normalizePrimaryGuild(body?.primary_guild);
    cache.set(userId, { time: Date.now(), value });
    return value;
  } catch (error) {
    debugProfile('request failed:', error?.message || error);
    cache.set(userId, { time: Date.now(), value: null });
    return null;
  }
}

module.exports = { fetchDiscordClanTag };
