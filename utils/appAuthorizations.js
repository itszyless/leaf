const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'appAuthorizations.json');
function readStore() {
  try {
    if (!fs.existsSync(file)) return { users: {} };
    const data = JSON.parse(fs.readFileSync(file, 'utf8') || '{"users":{}}');
    if (!data.users) data.users = {};
    return data;
  } catch { return { users: {} }; }
}
function writeStore(data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function markAuthorized(user) {
  if (!user?.id) return false;
  const data = readStore();
  const id = String(user.id);
  const existed = Boolean(data.users[id]?.authorized);
  data.users[id] = { ...(data.users[id] || {}), id, username: user.username || data.users[id]?.username || null, globalName: user.globalName || user.displayName || data.users[id]?.globalName || null, authorized: true, authorizedAt: data.users[id]?.authorizedAt || Date.now(), lastSeenAt: Date.now() };
  writeStore(data);
  return !existed;
}
function markDeauthorized(userId) {
  if (!userId) return null;
  const data = readStore();
  const id = String(userId);
  const entry = data.users[id] || { id };
  entry.authorized = false;
  entry.deauthorizedAt = Date.now();
  data.users[id] = entry;
  writeStore(data);
  return entry;
}
function authorizedCount() { const data = readStore(); return Object.values(data.users || {}).filter(x => x && x.authorized !== false).length; }
module.exports = { readStore, markAuthorized, markDeauthorized, authorizedCount };
