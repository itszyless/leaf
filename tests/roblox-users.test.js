const test = require('node:test');
const assert = require('node:assert/strict');
const users = require('../utils/robloxUsers');
test('public Roblox lookups map IDs and profiles without credentials', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.endsWith('usernames/users')
      ? { data: [{ id: 42 }] }
      : { name: 'Example', displayName: 'Example User', description: 'Bio', created: '2020-01-01T00:00:00Z', isBanned: false } };
  });
  assert.equal(await users.getIdFromUsername('Example'), 42);
  assert.equal(await users.getUsernameFromId(42), 'Example');
  assert.equal(JSON.parse(calls[0].options.body).usernames[0], 'Example');
  assert.equal(calls[1].url, 'https://users.roblox.com/v1/users/42');
  await assert.rejects(users.getPlayerInfo('../private'), /Invalid/);
});
test('provider failures are surfaced', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 429 }));
  await assert.rejects(users.getIdFromUsername('Example'), /429/);
});
