const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { EmbedBuilder } = require('discord.js');
const command = require('../commands/image');
const definitions = require('../utils/imageToolDefinitions');
const palette = require('../utils/imagePalette');
const embeds = require('../utils/getUserEmbed');
const access = require('../utils/plusAccess');
const models = require('../utils/imageModels');
test('all 15 slash-command routes produce replies with a usable file and no original thumbnail', async t => {
  const input = await sharp({ create: { width: 100, height: 80, channels: 4, background: '#204060' } }).png().toBuffer();
  t.mock.method(palette, 'downloadImage', async () => input);
  t.mock.method(embeds, 'getUserEmbed', async () => new EmbedBuilder());
  t.mock.method(access, 'isPlusActive', () => true);
  t.mock.method(models, 'removeBackground', async buffer => buffer);
  t.mock.method(models, 'extractText', async () => 'Leaf text');
  const values = { width: 50, regions: '0,0,10,10', format: 'png', colours: '#000000,#ffffff', shadows: '#000000', highlights: '#ffffff' };
  for (const [name] of definitions.tools) {
    let reply;
    const schema = command.data.toJSON().options.find(o => o.name === name);
    const allowed = new Set(schema.options.map(o => o.name));
    const get = key => allowed.has(key) ? values[key] ?? null : null;
    const interaction = { user: { id: 'test-image' }, options: { getSubcommand: () => name, getString: get, getInteger: get, getBoolean: () => null, getAttachment: key => allowed.has(key) && ['image', 'image1', 'image2'].includes(key) ? { url: 'test' } : null }, editReply: async value => { reply = value; } };
    await command.execute(interaction);
    assert.equal(reply.files?.length, 1, `${name}: ${reply.embeds?.[0]?.data.description}`);
    assert.equal(reply.embeds[0].data.thumbnail, undefined);
    assert.deepEqual(reply.allowedMentions, { parse: [] });
  }
});
