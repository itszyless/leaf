// Public profile lookups only; no Roblox login cookie or legacy request client.
async function request(route, options = {}) {
  const response = await fetch(`https://users.roblox.com/v1/${route}`, {
    ...options, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Roblox lookup failed (${response.status})`);
  return response.json();
}
async function getIdFromUsername(username) {
  const result = await request('usernames/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [String(username)], excludeBannedUsers: true }),
  });
  return result.data?.[0]?.id || null;
}
async function getPlayerInfo(id) {
  if (!/^\d+$/.test(String(id))) throw new Error('Invalid Roblox user ID');
  const user = await request(`users/${id}`);
  return { username: user.name, displayName: user.displayName, blurb: user.description,
    joinDate: user.created, age: Math.floor((Date.now() - Date.parse(user.created)) / 86400000), isBanned: user.isBanned };
}
async function getUsernameFromId(id) { return (await getPlayerInfo(id)).username; }
module.exports = { getIdFromUsername, getPlayerInfo, getUsernameFromId };
