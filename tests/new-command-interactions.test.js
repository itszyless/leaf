const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const palette = require('../utils/imagePalette');
const plusAccess = require('../utils/plusAccess');
const embedUtils = require('../utils/getUserEmbed');
const imageCommand = require('../commands/image');
const timestampCommand = require('../commands/timestamp');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('timestamp command produces every copyable Discord format and timezone autocomplete', async t => {
  t.mock.method(embedUtils, 'getUserEmbed', async () => new EmbedBuilder());
  let response;
  const values = { time: '2027-04-20 23:12', timezone: 'Europe/Vienna' };
  const interaction = { user: { id: 'test' }, options: { getString: name => values[name] || null },
    editReply: async payload => { response = payload; } };
  await timestampCommand.execute(interaction);
  const fields = response.embeds[0].toJSON().fields;
  assert.equal(fields.length, 7);
  for (const field of fields) assert.match(field.value, /<t:\d+:[tTdDfFR]>\n`<t:\d+:[tTdDfFR]>`/);
  values.format = 'R';
  await timestampCommand.execute(interaction);
  assert.equal(response.embeds[0].toJSON().fields.length, 1);
  values.time = 'impossible date';
  await timestampCommand.execute(interaction);
  assert.match(response.embeds[0].toJSON().description, /could not read/);
  let choices;
  await timestampCommand.autocomplete({ options: { getFocused: () => ({ name: 'timezone', value: 'Vienna' }) }, respond: async value => { choices = value; } });
  assert.ok(choices.some(choice => choice.value === 'Europe/Vienna'));
});

for (const plus of [false, true]) test(`palette command enforces ${plus ? 'Plus / six' : 'free / three'} pages and protects navigation`, async t => {
  t.mock.method(embedUtils, 'getUserEmbed', async () => new EmbedBuilder());
  t.mock.method(plusAccess, 'isPlusActive', () => plus);
  t.mock.method(palette, 'downloadImage', async () => Buffer.from('fake input'));
  t.mock.method(palette, 'paletteFromBuffer', async (_buffer, limit) => ({
    colors: Array.from({ length: limit }, (_, i) => ({ hex: '#' + (i * 500000).toString(16).padStart(6, '0').toUpperCase(), rgb: [i, i, i], percentage: 2 })), animated: false,
  }));
  t.mock.method(palette, 'swatchBuffer', async () => Buffer.from('fake swatch'));
  const collector = new EventEmitter();
  let collectorOptions;
  const message = { createMessageComponentCollector: options => { collectorOptions = options; return collector; } };
  const edits = [];
  const attachment = { url: 'https://cdn.discordapp.com/attachments/1/2/example.png' };
  const interaction = { id: 'session1', user: { id: 'owner' }, options: { getAttachment: () => attachment },
    editReply: async payload => { edits.push(payload); return message; } };
  await imageCommand.execute(interaction);
  const pages = plus ? 6 : 3;
  assert.equal(edits[0].embeds[0].toJSON().fields.length, 5);
  assert.equal(edits[0].embeds[0].toJSON().thumbnail.url, attachment.url);
  assert.match(edits[0].embeds[0].toJSON().footer.text, new RegExp(`Page 1/${pages}`));
  assert.ok(collectorOptions.filter({ customId: 'palette:session1:next' }));
  assert.equal(collectorOptions.filter({ customId: 'palette:other:next' }), false);
  let refused;
  collector.emit('collect', { user: { id: 'other' }, customId: 'palette:session1:next', reply: async payload => { refused = payload; } });
  await tick();
  assert.equal(refused.flags, MessageFlags.Ephemeral);
  assert.equal(edits.length, 1);
  let acknowledgements = 0;
  const button = { user: { id: 'owner' }, customId: 'palette:session1:next', deferUpdate: async () => { acknowledgements++; } };
  for (let i = 0; i < 8; i++) collector.emit('collect', button);
  await tick(); await tick();
  assert.equal(acknowledgements, 8);
  const last = edits.at(-1);
  assert.match(last.embeds[0].toJSON().footer.text, new RegExp(`Page ${pages}/${pages}`));
  assert.equal(last.components[0].toJSON().components[1].disabled, true);
  assert.deepEqual(last.attachments, []);
  collector.emit('collect', { ...button, customId: 'palette:session1:previous' });
  await tick();
  assert.match(edits.at(-1).embeds[0].toJSON().footer.text, new RegExp(`Page ${pages - 1}/${pages}`));
  collector.emit('end');
  await tick();
  assert.ok(edits.at(-1).components[0].toJSON().components.every(component => component.disabled));
});

test('a short palette has no empty pages or unnecessary collector', async t => {
  t.mock.method(embedUtils, 'getUserEmbed', async () => new EmbedBuilder());
  t.mock.method(plusAccess, 'isPlusActive', () => true);
  t.mock.method(palette, 'downloadImage', async () => Buffer.alloc(1));
  t.mock.method(palette, 'paletteFromBuffer', async () => ({ colors: [{ rgb: [255, 0, 0], hex: '#FF0000', percentage: 100 }], animated: true }));
  t.mock.method(palette, 'swatchBuffer', async () => Buffer.alloc(1));
  let payload;
  await imageCommand.execute({ user: { id: 'owner' }, options: { getAttachment: () => ({ url: 'https://cdn.discordapp.com/attachments/1/2/a.gif' }) },
    editReply: async result => { payload = result; return {}; } });
  assert.deepEqual(payload.components, []);
  assert.match(payload.embeds[0].toJSON().description, /first frame/);
  assert.match(payload.embeds[0].toJSON().footer.text, /Page 1\/1/);
});

test('attachment failures return a useful command error rather than a rejected interaction', async t => {
  t.mock.method(embedUtils, 'getUserEmbed', async () => new EmbedBuilder());
  t.mock.method(plusAccess, 'isPlusActive', () => false);
  t.mock.method(palette, 'downloadImage', async () => { throw new Error('Images must be no larger than 10 MB.'); });
  let response;
  await imageCommand.execute({ user: { id: 'owner' }, options: { getAttachment: () => ({}) }, editReply: async payload => { response = payload; } });
  assert.match(response.embeds[0].toJSON().description, /10 MB/);
});
