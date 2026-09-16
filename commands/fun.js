const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
async function request(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  return fetch(url, { agent: httpsAgent, ...options });
}
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');
const { quotes } = require('../data/quotes.json');

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function seededPercent(seed) {
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 101;
}

function weightedPpSize(seed) {
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const roll = Math.abs(hash) % 10000;
  if (roll < 5200) return 1 + (roll % 40) / 10;
  if (roll < 8200) return 5 + (roll % 25) / 10;
  if (roll < 9500) return 7.5 + (roll % 20) / 10;
  if (roll < 9900) return 9.5 + (roll % 18) / 10;
  return 11.5 + (roll % 25) / 10;
}

const data = {
  joke: [
    'I tried to catch fog yesterday. Mist.',
    'I told my computer I needed a break, and it said no problem, then froze.',
    'Why did the scarecrow win an award? Because he was outstanding in his field.',
    'I only know 25 letters of the alphabet. I do not know y.',
    'Parallel lines have so much in common. It is a shame they will never meet.',
    'I asked my calendar why it looked stressed. It said its days were numbered.',
    'My password got rejected for being too weak, which felt personal.',
    'I made a pencil with two erasers. It was pointless.',
  ],
  confession: [
    'Confess something harmless you have never told this chat.',
    'Confess the weirdest thing you searched recently.',
    'Confess a habit you pretend is normal.',
    'Confess a food combo you secretly like.',
    'Confess something you always overthink.',
    'Confess the last thing that made you laugh for no reason.',
    'Confess a tiny lie you tell way too often.',
    'Confess your most unserious fear.',
  ],
  hotseat: [
    'What is one opinion you will defend for no reason?',
    'What is the funniest way you have embarrassed yourself?',
    'What is one thing you are weirdly good at?',
    'What is a song you skip but still know every word to?',
    'What is your most suspiciously specific talent?',
    'What would your friends roast you for instantly?',
    'What is your comfort movie, show, or game?',
    'What is something you liked before it was popular?',
  ],
  thisorthat: ['Late night or early morning?', 'Texting or calling?', 'Sweet or salty?', 'Movies or games?', 'Money or fame?', 'Cold weather or hot weather?', 'Chaos or routine?', 'Solo queue or full party?'],
  challenge: ['Send your next message without using the letter E.', 'Compliment the person above you.', 'Say your current mood in three words.', 'Type a sentence like you are a movie villain.', 'Send a message using only questions.', 'Describe your day as a game patch note.'],
  vibecheck: ['Vibe check passed. Clean energy today.', 'Vibe check passed, but barely. Drink water.', 'Vibe check failed in a funny way.', 'Vibe check: mysterious side character energy.', 'Vibe check: main character, but on low battery.', 'Vibe check: chaotic but useful.'],
  personality: ['You are the planner who still somehow improvises everything.', 'You are the quiet one until the exact right topic appears.', 'You are 70% jokes, 30% surprisingly good advice.', 'You are the friend who says one more and means five more.', 'You are side quest coded, but in a powerful way.'],
  prophecy: [
    'A small inconvenience will become suspiciously funny by tomorrow.',
    'You will open an app, forget why, and somehow still make progress.',
    'Someone will say your name in a conversation you were not meant to hear.',
    'Your next good idea will arrive at the most inconvenient possible time.',
    'A random message will change the entire vibe of your day.',
    'You will survive the next dramatic minor problem with style.',
    'A snack will fix more than it reasonably should.',
    'You are about to enter a side quest disguised as a normal task.',
  ],
  apology: [
    'I deeply regret my actions, except the parts that were objectively hilarious.',
    'I apologize for the chaos. In my defense, the timing was perfect.',
    'I am sorry for what I said while pretending I had a plan.',
    'Please accept this apology and ignore the fact I would probably do it again.',
    'I take full responsibility for the vibes getting out of hand.',
    'I apologize for being correct in the most annoying way possible.',
    'My bad. The situation got silly and I chose to contribute.',
    'I am sorry. Growth is happening, allegedly.',
  ],
};

const EMOJI_KITCHEN_DATES = [
  '20241015', '20240206', '20231113', '20230803', '20230418', '20230216',
  '20221101', '20220815', '20220406', '20220203', '20211115', '20210831',
  '20210521', '20210218', '20201001', '20200817'
];
const DEFAULT_MIX_EMOJIS = ['\u{1F600}', '\u{1F923}', '\u{1F60E}', '\u{1F62D}', '\u{1F480}', '\u{1F525}'];
const SHORTENER_HOSTS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'buff.ly', 'ow.ly', 'cutt.ly', 'rebrand.ly']);

function extractEmojiTokens(input) {
  const cleaned = String(input || '').trim();
  const tokens = cleaned ? cleaned.split(/[\s,]+/).filter(Boolean) : [];
  const emojiRegex = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|[\u{1F1E6}-\u{1F1FF}]{2}/gu;
  const emojis = [];
  for (const token of tokens) {
    const matches = token.match(emojiRegex) || [];
    emojis.push(...matches);
  }
  return emojis.slice(0, 2);
}

function emojiCodepoint(emoji) {
  return Array.from(emoji)
    .filter(ch => ch !== '\uFE0F' && ch !== '\uFE0E' && ch !== '\u200D')
    .map(ch => 'u' + ch.codePointAt(0).toString(16))
    .join('_');
}

async function firstWorkingEmojiKitchenUrl(first, second) {
  const a = emojiCodepoint(first);
  const b = emojiCodepoint(second);
  const pairs = [`${a}/${a}_${b}.png`, `${b}/${b}_${a}.png`];
  for (const date of EMOJI_KITCHEN_DATES) {
    for (const pair of pairs) {
      const url = `https://www.gstatic.com/android/keyboard/emojikitchen/${date}/${pair}`;
      try {
        const res = await request(url, { method: 'HEAD' });
        if (res.ok) return url;
      } catch {}
    }
  }
  return null;
}

async function fetchJson(url) {
  const res = await request(url, { headers: { 'User-Agent': 'leaf Discord Bot' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, text, json };
}

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!/^https?:\/\//i.test(value)) return `https://${value}`;
  return value;
}

async function resolveRedirects(rawUrl) {
  const visited = [];
  let current = normalizeUrl(rawUrl);
  for (let i = 0; i < 10; i++) {
    let res = await request(current, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 leaf Discord Bot' } }).catch(() => null);
    if (!res || (res.status >= 400 && res.status !== 404 && !res.headers?.get?.('location'))) {
      res = await request(current, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 leaf Discord Bot' } }).catch(() => null);
    }
    if (!res) break;
    visited.push(current);
    const location = res.headers.get('location');
    if (![301, 302, 303, 307, 308].includes(res.status) || !location) break;
    current = new URL(location, current).toString();
  }
  return { url: current, hops: visited.length };
}

async function bypassUrl(rawUrl) {
  const input = normalizeUrl(rawUrl);
  let parsed;
  try { parsed = new URL(input); } catch { throw new Error('Please enter a valid URL.'); }

  if (SHORTENER_HOSTS.has(parsed.hostname.replace(/^www\./, '').toLowerCase())) {
    const resolved = await resolveRedirects(input);
    if (resolved.url && resolved.url !== input) return { result: resolved.url, provider: 'Redirect resolver' };
  }

  const providers = [
    `https://unshorten.me/json/${encodeURIComponent(input)}`,
    `https://api.bypass.vip/bypass?url=${encodeURIComponent(input)}`,
    `https://bypass.pm/bypass2?url=${encodeURIComponent(input)}`,
  ];

  for (const providerUrl of providers) {
    try {
      const { ok, json } = await fetchJson(providerUrl);
      if (!ok || !json) continue;
      const result = json.resolved_url || json.result || json.destination || json.url || json.bypassed || json.redirect;
      if (typeof result === 'string' && /^https?:\/\//i.test(result) && !/free api shut down/i.test(result)) {
        return { result, provider: new URL(providerUrl).hostname };
      }
    } catch {}
  }

  const resolved = await resolveRedirects(input);
  if (resolved.url && resolved.url !== input) return { result: resolved.url, provider: 'Redirect resolver' };
  throw new Error('Could not bypass that URL. It may be unsupported or temporarily blocked.');
}

const forwarded = {
  fakeban: () => require('./fakeban'),
  fakenitro: () => require('./fakenitro'),
  fact: () => require('./fact'),
  nerdrate: () => require('../plusCommands/nerdrate'),
  password: () => require('./password'),
  spam: () => require('./spam'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fun')
    .setDescription('Fun prompts and quick random commands')
    .addSubcommand(s => s.setName('joke').setDescription('Get a quick joke'))
    .addSubcommand(s => s.setName('confession').setDescription('Get a harmless confession prompt'))
    .addSubcommand(s => s.setName('hotseat').setDescription('Get a hot-seat question'))
    .addSubcommand(s => s.setName('thisorthat').setDescription('Get a this-or-that prompt'))
    .addSubcommand(s => s.setName('challenge').setDescription('Get a small chat challenge'))
    .addSubcommand(s => s.setName('vibecheck').setDescription('Run a vibe check'))
    .addSubcommand(s => s.setName('personality').setDescription('Get a random personality read'))
    .addSubcommand(s => s.setName('prophecy').setDescription('Receive a suspiciously specific prophecy').addUserOption(o => o.setName('user').setDescription('User to prophesize about').setRequired(false)))
    .addSubcommand(s => s.setName('apology').setDescription('Generate a dramatic apology').addUserOption(o => o.setName('user').setDescription('User to apologize for').setRequired(false)))
    .addSubcommand(s => s.setName('coinflip').setDescription('Flip a coin'))
    .addSubcommand(s => s.setName('howgay').setDescription('Check how gay someone is').addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(s => s.setName('howautistic').setDescription('Check how autistic someone is').addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(s => s.setName('hotcalc').setDescription('Check how hot someone is').addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(s => s.setName('ppsize').setDescription('Check pp size').addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(s => s.setName('fakeban').setDescription('Pretend to ban someone').addUserOption(o => o.setName('user').setDescription('User to fake ban').setRequired(true)))
    .addSubcommand(s => s.setName('fakenitro').setDescription('Generate a fake Nitro gift'))
    .addSubcommand(s => s.setName('fact').setDescription('Get a random fact'))
    .addSubcommand(s => s.setName('nerdrate').setDescription('See how much of a nerd someone is').addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(s => s.setName('password').setDescription('Generate a secure random password').addIntegerOption(o => o.setName('length').setDescription('Password length').setMinValue(4).setMaxValue(64).setRequired(false)))
    .addSubcommand(s => s.setName('spam').setDescription('Spam messages in the current channel').addStringOption(o => o.setName('text').setDescription('Custom spam message (plus only)').setRequired(false)))
    .addSubcommand(s => s.setName('meme').setDescription('Get a random safe meme'))
    .addSubcommand(s => s.setName('quote').setDescription('Get a random quote'))
    .addSubcommand(s => s.setName('rate').setDescription('Rate something').addStringOption(o => o.setName('thing').setDescription('What should I rate?').setRequired(true).setMaxLength(50)))
    .addSubcommand(s => s.setName('bypass').setDescription('Bypass a URL').addStringOption(o => o.setName('url').setDescription('URL to bypass').setRequired(true)))
    .addSubcommand(s => s.setName('emojimix').setDescription('Mix two emojis').addStringOption(o => o.setName('emojis').setDescription('Two emojis separated by commas or spaces').setRequired(true))),
  category: 'Fun',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (forwarded[sub]) return forwarded[sub]().execute(interaction);

    if (data[sub]) {
      const titles = { joke: 'Joke', confession: 'Confession Prompt', hotseat: 'Hot Seat', thisorthat: 'This or That', challenge: 'Challenge', vibecheck: 'Vibe Check', personality: 'Personality', prophecy: 'Prophecy', apology: 'Apology' };
      const embed = await getUserEmbed(interaction.user.id, titles[sub]);
      const target = ['prophecy', 'apology'].includes(sub) ? (interaction.options.getUser('user') || interaction.user) : null;
      const line = pick(data[sub]);
      embed.setDescription(target ? '**' + target.username + ':** ' + line : line);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'bypass') {
      const url = interaction.options.getString('url');
      const embed = await getUserEmbed(interaction.user.id, 'URL Bypass');
      try {
        const bypassed = await bypassUrl(url);
        embed.setDescription([
          `**Original:** ${normalizeUrl(url)}`,
          `**Result:** ${bypassed.result}`,
          `**Provider:** ${bypassed.provider}`,
        ].join('\n'));
      } catch (error) {
        embed.setTitle('Bypass Failed').setDescription(error.message || 'Could not bypass that URL.');
      }
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'emojimix') {
      const emojis = extractEmojiTokens(interaction.options.getString('emojis'));
      const embed = await getUserEmbed(interaction.user.id, 'Emoji Mix');
      if (emojis.length < 2) {
        embed.setTitle('Emoji Mix Failed').setDescription('Please enter exactly two emojis, separated by spaces or commas.');
        return interaction.editReply({ embeds: [embed] });
      }
      const [first, second] = emojis;
      const imageUrl = await firstWorkingEmojiKitchenUrl(first, second);
      if (!imageUrl) {
        embed.setTitle('Emoji Mix Failed').setDescription('That emoji pair is not available in Emoji Kitchen. Try another combo.');
        return interaction.editReply({ embeds: [embed] });
      }
      embed.setDescription(`${first} + ${second}`).setImage(imageUrl);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'coinflip') {
      const embed = await getUserEmbed(interaction.user.id, 'Coin Flip');
      embed.setDescription(`**${Math.random() < 0.5 ? 'Heads' : 'Tails'}**`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'howgay' || sub === 'howautistic' || sub === 'hotcalc' || sub === 'ppsize') {
      const target = interaction.options.getUser('user') || interaction.user;
      if (sub === 'ppsize') {
        const inches = weightedPpSize(`${target.id}:ppsize:${new Date().toISOString().slice(0, 10)}`);
        const cm = inches * 2.54;
        const bar = '?'.repeat(Math.max(1, Math.min(14, Math.round(inches))));
        const embed = await getUserEmbed(interaction.user.id, 'PP Size');
        embed.setDescription(`**${target.username}** pp size: **${inches.toFixed(1)} in** / **${cm.toFixed(1)} cm**\n\`${bar}\``);
        return interaction.editReply({ embeds: [embed] });
      }

      const key = sub === 'howgay' ? 'gay' : sub === 'howautistic' ? 'autistic' : 'hot';
      const percent = seededPercent(`${target.id}:${key}:${new Date().toISOString().slice(0, 10)}`);
      const title = sub === 'howgay' ? 'How Gay' : sub === 'howautistic' ? 'How Autistic' : 'Hot Calculator';
      const embed = await getUserEmbed(interaction.user.id, title);
      embed.setDescription(`**${target.username}** is \`${percent}%\` ${key} today.`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'quote') {
      const random = pick(quotes);
      const embed = await getUserEmbed(interaction.user.id, 'Quote');
      embed.setDescription(`"${random.quote}"\n- **${random.author}**`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'rate') {
      const thing = interaction.options.getString('thing');
      const embed = await getUserEmbed(interaction.user.id, 'Rate');
      embed.setDescription(`> ${thing}\nScore: \`${Math.floor(Math.random() * 101)}%\``);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'meme') {
      try {
        const res = await request('https://meme-api.com/gimme');
        const meme = await res.json();
        if (!res.ok || meme.nsfw) throw new Error('Could not fetch a safe meme.');
        const embed = await getUserEmbed(interaction.user.id, 'Meme');
        embed.setTitle(meme.title || 'Random Meme').setURL(meme.postLink).setImage(meme.url);
        return interaction.editReply({ embeds: [embed] });
      } catch {
        const embed = await getUserEmbed(interaction.user.id, null, 'error');
        embed.setDescription('Failed to fetch a meme. Please try again later.');
        return interaction.editReply({ embeds: [embed] });
      }
    }
  },
};



