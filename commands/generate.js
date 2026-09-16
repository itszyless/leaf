const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { renderFakeMessage, renderFakeVc, normalizeTheme } = require('../utils/fakeMessageRenderer');
const { fetchDiscordClanTag } = require('../utils/discordProfile');

function themeOrDark(theme) {
  const key = String(theme || '').trim().toLowerCase();
  if (!key) return 'dark';
  const normalized = normalizeTheme(key);
  return normalized === key ? normalized : 'dark';
}

const CONVO_BACKGROUNDS = {
  dark: '#313338',
  ash: '#2b2d31',
  onyx: '#1e1f22',
  black: '#000000',
  light: '#ffffff',
};

function parseTimestampBase(value) {
  const raw = String(value || '').trim();
  const now = new Date();
  if (!raw) return now;
  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3]?.toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  if (!ampm && hour > 23) return null;
  if (minute > 59) return null;
  const date = new Date(now);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function formatConversationTime(date) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
}

function conversationTimestamp(index, baseInput, baseDate) {
  if (index === 0 && baseInput) return String(baseInput).slice(0, 20);
  if (!baseDate) return baseInput ? String(baseInput).slice(0, 20) : formatConversationTime(new Date());
  const offsets = [0, 1, 2, 2, 3, 5, 5, 6, 8, 9];
  const date = new Date(baseDate.getTime() + (offsets[index] || index) * 60 * 1000);
  return formatConversationTime(date);
}

async function buildConversationEntries(interaction) {
  const entries = [];
  let previousUser = interaction.user;
  for (let i = 1; i <= 10; i++) {
    const msg = interaction.options.getString(`msg${i}`);
    const selectedUser = interaction.options.getUser(`user${i}`);
    if (!msg) continue;
    const user = selectedUser || previousUser || interaction.user;
    previousUser = user;
    entries.push({ user, text: msg });
  }
  return entries;
}

async function sendFakeConvo(interaction) {
  const entries = await buildConversationEntries(interaction);
  if (!entries.length) return sendFakeMessage(interaction, { text: interaction.options.getString('msg1') || 'Hello', user: interaction.user });

  const theme = themeOrDark(interaction.options.getString('theme'));
  const timestampInput = interaction.options.getString('timestamp');
  const baseDate = parseTimestampBase(timestampInput);
  const mentionMap = await buildMentionMap(interaction, entries.map(entry => entry.text).join(' '));
  const useUsername = interaction.options.getBoolean('use_usernames') || false;
  const hideClanTags = interaction.options.getBoolean('hide_clantags') || false;
  const clanCache = new Map();
  const rowBuffers = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const member = await memberFor(interaction, entry.user);
    let clanTag = null;
    if (!hideClanTags) {
      if (!clanCache.has(entry.user.id)) clanCache.set(entry.user.id, await fetchDiscordClanTag(entry.user.id));
      clanTag = clanCache.get(entry.user.id);
    }
    const rendered = await renderFakeMessage({
      user: entry.user,
      member,
      clanTag,
      mentionMap,
      text: entry.text,
      theme,
      timestamp: conversationTimestamp(i, timestampInput, baseDate),
      useUsername,
      hideClanTags,
      appBadge: 'none',
    });
    rowBuffers.push(rendered.buffer);
  }

  const images = [];
  for (const buffer of rowBuffers) images.push(await loadImage(buffer));
  const width = Math.max(...images.map(image => image.width));
  const gap = -25;
  const height = images.reduce((sum, image) => sum + image.height, 0) + Math.max(0, images.length - 1) * gap;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = CONVO_BACKGROUNDS[theme] || CONVO_BACKGROUNDS.dark;
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const image of images) {
    ctx.drawImage(image, 0, y);
    y += image.height + gap;
  }

  const buffer = canvas.toBuffer('image/png');
  const attachment = new AttachmentBuilder(buffer, { name: 'fake-convo.png' });
  const payload = { files: [attachment] };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}
async function buildMentionMap(interaction, text) {
  const ids = [...new Set([...String(text || '').matchAll(/<@!?(\d{15,25})>/g)].map(match => match[1]))].slice(0, 25);
  const map = {};

  for (const id of ids) {
    const cachedMember = interaction.guild?.members?.cache?.get(id) || null;
    const member = cachedMember || (interaction.guild ? await interaction.guild.members.fetch({ user: id, force: true }).catch(() => null) : null);
    const cachedUser = interaction.client.users.cache.get(id) || null;
    const user = member?.user || cachedUser || await interaction.client.users.fetch(id, { force: true }).catch(() => null);
    const label = member?.displayName || user?.displayName || user?.globalName || user?.username;
    if (label) map[id] = String(label).slice(0, 32);
  }

  return map;
}
async function memberFor(interaction, user) {
  if (!interaction.guild || !user) return null;
  return interaction.guild.members.fetch(user.id).catch(() => null);
}

async function buildFakeVcUsers(interaction) {
  const selected = [];
  const seen = new Set();
  for (let i = 1; i <= 5; i++) {
    const user = interaction.options.getUser(`user${i}`);
    if (!user || seen.has(user.id)) continue;
    seen.add(user.id);
    const member = await memberFor(interaction, user);
    const clanTag = await fetchDiscordClanTag(user.id);
    selected.push({ user, member, clanTag });
  }

  if (!selected.length) {
    const user = interaction.user;
    selected.push({ user, member: await memberFor(interaction, user), clanTag: await fetchDiscordClanTag(user.id) });
  }

  return selected;
}

async function sendFakeVc(interaction) {
  const users = await buildFakeVcUsers(interaction);
  const { buffer } = await renderFakeVc({
    users,
    theme: themeOrDark(interaction.options.getString('theme')),
    channel: interaction.options.getString('channel') || 'General',
    useUsernames: interaction.options.getBoolean('use_usernames') || false,
  });
  const toGif = interaction.options.getBoolean('to_gif') || false;
  const attachment = new AttachmentBuilder(buffer, { name: toGif ? 'fake-vc.gif' : 'fake-vc.png' });
  const payload = { files: [attachment] };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}
async function sendFakeMessage(interaction, options) {
  const user = options.user || interaction.user;
  const mentionMap = await buildMentionMap(interaction, options.text);
  const member = await memberFor(interaction, user);
  const clanTag = await fetchDiscordClanTag(user.id);
  const { buffer } = await renderFakeMessage({ ...options, user, member, clanTag, mentionMap });
  const attachment = new AttachmentBuilder(buffer, { name: options.toGif ? 'fake-message.gif' : 'fake-message.png' });
  const payload = { files: [attachment] };

  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Generate images and mockups')
    .addSubcommand(sub =>
      sub
        .setName('fake-message')
        .setDescription('Generate a fake Discord message')
        .addStringOption(opt => opt.setName('text').setDescription('Message text').setRequired(true).setMaxLength(1000))
        .addUserOption(opt => opt.setName('user').setDescription('User to show').setRequired(false))
        .addStringOption(opt => opt.setName('badge').setDescription('Show a Discord app/bot badge').setRequired(false).addChoices(
          { name: 'Auto', value: 'auto' },
          { name: 'App', value: 'app' },
          { name: 'Verified App', value: 'verified' },
          { name: 'Bot', value: 'bot' },
          { name: 'Verified Bot', value: 'verified_bot' },
          { name: 'None', value: 'none' },
        ))
        .addStringOption(opt => opt.setName('theme').setDescription('Image theme').setRequired(false).addChoices(
          { name: 'Dark', value: 'dark' },
          { name: 'Ash', value: 'ash' },
          { name: 'Onyx', value: 'onyx' },
          { name: 'Black', value: 'black' },
          { name: 'Light', value: 'light' },
        ))
        .addStringOption(opt => opt.setName('timestamp').setDescription('Custom timestamp text, e.g. 5:27 PM').setRequired(false).setMaxLength(20))
        .addStringOption(opt => opt.setName('reactions').setDescription('Reactions, e.g. "\u{1F480} \u{1F377}:2"').setRequired(false).setMaxLength(180))
        .addBooleanOption(opt => opt.setName('mention_highlight').setDescription('Show Discord mention highlight background').setRequired(false))
        .addBooleanOption(opt => opt.setName('use_username').setDescription('Use username instead of display name').setRequired(false))
        .addBooleanOption(opt => opt.setName('hide_clantags').setDescription('Hide Discord clan tags').setRequired(false))
        .addBooleanOption(opt => opt.setName('to_gif').setDescription('Send as .gif filename').setRequired(false)),
    )
    .addSubcommand(sub =>
      sub
        .setName('fake-vc')
        .setDescription('Generate a fake Discord voice channel view')
        .addUserOption(opt => opt.setName('user1').setDescription('First user to show').setRequired(false))
        .addUserOption(opt => opt.setName('user2').setDescription('Second user to show').setRequired(false))
        .addUserOption(opt => opt.setName('user3').setDescription('Third user to show').setRequired(false))
        .addUserOption(opt => opt.setName('user4').setDescription('Fourth user to show').setRequired(false))
        .addUserOption(opt => opt.setName('user5').setDescription('Fifth user to show').setRequired(false))
        .addStringOption(opt => opt.setName('theme').setDescription('Image theme').setRequired(false).addChoices(
          { name: 'Dark', value: 'dark' },
          { name: 'Ash', value: 'ash' },
          { name: 'Onyx', value: 'onyx' },
          { name: 'Black', value: 'black' },
          { name: 'Light', value: 'light' },
        ))
        .addBooleanOption(opt => opt.setName('use_usernames').setDescription('Use usernames instead of display names').setRequired(false))
        .addStringOption(opt => opt.setName('channel').setDescription('Voice channel name').setRequired(false).setMaxLength(30))
        .addBooleanOption(opt => opt.setName('to_gif').setDescription('Send as .gif filename').setRequired(false)),
    )
    .addSubcommand(sub => {
      sub
        .setName('fake-convo')
        .setDescription('Generate a fake Discord conversation')
        .addUserOption(opt => opt.setName('user1').setDescription('First user').setRequired(true))
        .addStringOption(opt => opt.setName('msg1').setDescription('First message').setRequired(true).setMaxLength(1000));
      for (let i = 2; i <= 10; i++) {
        sub.addUserOption(opt => opt.setName(`user${i}`).setDescription(`User ${i}`).setRequired(false));
        sub.addStringOption(opt => opt.setName(`msg${i}`).setDescription(`Message ${i}`).setRequired(false).setMaxLength(1000));
      }
      sub
        .addStringOption(opt => opt.setName('theme').setDescription('Image theme').setRequired(false).addChoices(
          { name: 'Dark', value: 'dark' },
          { name: 'Ash', value: 'ash' },
          { name: 'Onyx', value: 'onyx' },
          { name: 'Black', value: 'black' },
          { name: 'Light', value: 'light' },
        ))
        .addStringOption(opt => opt.setName('timestamp').setDescription('Starting timestamp, e.g. 5:27 PM').setRequired(false).setMaxLength(20))
        .addBooleanOption(opt => opt.setName('use_usernames').setDescription('Use usernames instead of display names').setRequired(false))
        .addBooleanOption(opt => opt.setName('hide_clantags').setDescription('Hide Discord clan tags').setRequired(false));
      return sub;
    })
    .addSubcommand(sub => sub.setName('wanted').setDescription('Create a One Piece style wanted poster').addUserOption(opt => opt.setName('user').setDescription('User to make wanted').setRequired(false))),
  category: 'Media',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'wanted') return require('./wanted').execute(interaction);
    if (sub === 'fake-vc') return sendFakeVc(interaction);
    if (sub === 'fake-convo') return sendFakeConvo(interaction);
    if (sub !== 'fake-message') return;

    return sendFakeMessage(interaction, {
      text: interaction.options.getString('text'),
      user: interaction.options.getUser('user') || interaction.user,
      appBadge: interaction.options.getString('badge') || 'auto',
      theme: themeOrDark(interaction.options.getString('theme')),
      timestamp: interaction.options.getString('timestamp'),
      reactions: interaction.options.getString('reactions'),
      mentionHighlight: interaction.options.getBoolean('mention_highlight') || false,
      useUsername: interaction.options.getBoolean('use_username') || false,
      hideClanTags: interaction.options.getBoolean('hide_clantags') || false,
      toGif: interaction.options.getBoolean('to_gif') || false,
    });
  },

  sendFakeMessage,
  sendFakeVc,
  sendFakeConvo,
  themeOrDark,
};






