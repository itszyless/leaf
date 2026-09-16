const fs = require('fs');
const path = require('path');
const config = require('../config.json');

const dataDir = path.join(__dirname, '..', 'data');
const plusPath = path.join(dataDir, 'plusUsers.json');
const expirationsPath = path.join(dataDir, 'plusExpirations.json');

function loadJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8') || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function logPlusEvent(action, userId, details = {}) {
  const url = config.Webhook_Plus || config.Webhook_Redeem;
  if (!url) return;
  const payload = {
    username: 'leaf Plus Logs',
    embeds: [{
      title: 'Plus ' + action,
      color: action === 'Removed' ? 0xff5f68 : action === 'Expired' ? 0xffb84d : 0x57f287,
      fields: [
        { name: 'User ID', value: String(userId || 'Unknown'), inline: true },
        { name: 'Source', value: String(details.source || details.label || 'Unknown'), inline: true },
        { name: 'Expires', value: details.expiresAt ? '<t:' + Math.floor(Number(details.expiresAt) / 1000) + ':F>' : 'Lifetime', inline: false },
      ],
      timestamp: new Date().toISOString(),
    }],
  };
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
}

function cleanupExpiredPlus(now = Date.now()) {
  const plus = loadJson(plusPath, {});
  const expirations = loadJson(expirationsPath, {});
  let changed = false;

  for (const [userId, entry] of Object.entries(expirations)) {
    const expiresAt = Number(entry?.expiresAt || 0);
    if (expiresAt && expiresAt <= now) {
      delete plus[userId];
      delete expirations[userId];
      logPlusEvent('Expired', userId, entry || {});
      changed = true;
    }
  }

  if (changed) {
    saveJson(plusPath, plus);
    saveJson(expirationsPath, expirations);
  }

  return changed;
}

function isPlusActive(userId) {
  cleanupExpiredPlus();
  const plus = loadJson(plusPath, {});
  return plus[String(userId)] === true;
}

function grantPlus(userId, options = {}) {
  const id = String(userId);
  const plus = loadJson(plusPath, {});
  const expirations = loadJson(expirationsPath, {});
  plus[id] = true;

  const expiresAt = Number(options.expiresAt || 0);
  if (expiresAt > Date.now()) {
    expirations[id] = {
      expiresAt,
      source: options.source || 'manual',
      label: options.label || null,
      skuId: options.skuId || null,
      entitlementId: options.entitlementId || null,
      grantedAt: Date.now(),
    };
  } else {
    delete expirations[id];
  }

  saveJson(plusPath, plus);
  saveJson(expirationsPath, expirations);
  logPlusEvent('Granted', id, { ...options, expiresAt });
}

function removePlus(userId) {
  const id = String(userId);
  const plus = loadJson(plusPath, {});
  const expirations = loadJson(expirationsPath, {});
  delete plus[id];
  delete expirations[id];
  saveJson(plusPath, plus);
  saveJson(expirationsPath, expirations);
  logPlusEvent('Removed', id, { source: 'remove' });
}

function parseDuration(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw || ['life', 'lifetime', 'forever', 'permanent', 'perm'].includes(raw)) return null;
  if (raw === 'monthly' || raw === 'month') return Date.now() + 30 * 24 * 60 * 60 * 1000;

  const match = raw.match(/^(\d{1,4})(m|h|d|w|mo)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    mo: 30 * 24 * 60 * 60 * 1000,
  };
  return Date.now() + amount * multipliers[unit];
}

function getPlusInfo(userId) {
  cleanupExpiredPlus();
  const id = String(userId);
  const plus = loadJson(plusPath, {});
  const expirations = loadJson(expirationsPath, {});
  return {
    active: plus[id] === true,
    expiration: expirations[id] || null,
  };
}

function plusSkuKind(skuId) {
  const id = String(skuId || '');
  if (id && id === String(config.Plus?.LifetimeSkuId || '')) return 'lifetime';
  if (id && id === String(config.Plus?.MonthlySkuId || '')) return 'monthly';
  return null;
}

function entitlementUserId(entitlement) {
  return entitlement?.userId || entitlement?.ownerId || entitlement?.user?.id || entitlement?.member?.user?.id || null;
}

function entitlementEndsAt(entitlement) {
  if (!entitlement) return null;
  if (typeof entitlement.endsTimestamp === 'number') return entitlement.endsTimestamp;
  if (entitlement.endsAt instanceof Date) return entitlement.endsAt.getTime();
  if (entitlement.endsAt) {
    const parsed = Date.parse(entitlement.endsAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

module.exports = {
  plusPath,
  expirationsPath,
  loadJson,
  saveJson,
  cleanupExpiredPlus,
  isPlusActive,
  grantPlus,
  removePlus,
  parseDuration,
  getPlusInfo,
  plusSkuKind,
  entitlementUserId,
  entitlementEndsAt,
};
