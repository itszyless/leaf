const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { abbreviate } = require('../utils/abbreviate');
const { isPlusActive } = require('../utils/plusAccess');

const dataDir = path.join(__dirname, '..', 'data');
const paths = {
  plus: path.join(dataDir, 'plusUsers.json'),
  economy: path.join(dataDir, 'economy.json'),
  analytics: path.join(dataDir, 'commandAnalytics.json'),
  roblox: path.join(dataDir, 'robloxAccessClaims.json'),
  blacklist: path.join(dataDir, 'blacklist.json'),
  audit: path.join(dataDir, 'adminAudit.json'),
  userLanguages: path.join(dataDir, 'userLanguages.json'),
  dmSettings: path.join(dataDir, 'DMSettings.json'),
  layouts: path.join(dataDir, 'userLayouts.json'),
  avatarHistory: path.join(dataDir, 'avatarHistory.json'),
  aura: path.join(dataDir, 'userAuras.json'),
  notes: path.join(dataDir, 'notes.json'),
  xp: path.join(dataDir, 'xp.json'),
};

const languageNames = {
  en: 'English',
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

function loadJSON(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8') || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatMoney(value) {
  const num = Number(value || 0);
  const sign = num < 0 ? '-' : '';
  return sign + abbreviate(Math.abs(num), 'prefix') + ' Cash';
}

function formatSignedMoney(value) {
  const num = Number(value || 0);
  return `${num > 0 ? '+' : ''}${formatMoney(num)}`;
}

function formatDate(ms) {
  return ms ? `<t:${Math.floor(ms / 1000)}:R>` : 'Never';
}

function boolText(value) {
  return value ? 'Yes' : 'No';
}

function languageName(code) {
  if (!code) return 'Default';
  const clean = String(code).toLowerCase();
  return languageNames[clean] || clean.toUpperCase();
}

function getAccess(id) {
  return isPlusActive(id) ? 'Plus' : 'Free';
}

function getRobloxClaim(discordId) {
  const claims = loadJSON(paths.roblox, {});
  return Object.values(claims).find(claim => String(claim.discordId) === String(discordId)) || null;
}

function getCommandUsage(id) {
  const data = loadJSON(paths.analytics, { users: {}, events: [] });
  const userStats = data.users?.[id] || { count: 0, commands: {} };
  const events = Array.isArray(data.events) ? data.events.filter(event => event.userId === id) : [];
  const last = events[events.length - 1] || null;
  const top = Object.entries(userStats.commands || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  return { total: userStats.count || 0, top, last };
}

function getStockStats(eco) {
  const stats = eco?.stockStats || {};
  const bets = Array.isArray(stats.bets) ? stats.bets : [];
  const net = bets.reduce((sum, bet) => sum + Number(bet.gain || 0), 0);
  return {
    total: stats.totalBets || bets.length || 0,
    wins: stats.wins || bets.filter(b => b.result === 'win').length || 0,
    losses: stats.losses || bets.filter(b => b.result === 'loss').length || 0,
    net,
  };
}

function trackAvatar(user) {
  try {
    const avatar = require('./avatar');
    if (typeof avatar.trackAvatar === 'function') avatar.trackAvatar(user);
  } catch {}
}

function field(name, value, inline = true) {
  return { name, value: String(value || 'None').slice(0, 1024), inline };
}
function parseColor(value, fallback = 0x5865f2) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return fallback;
  const clean = value.trim().replace(/^#/, '').replace(/^0x/i, '');
  const parsed = Number.parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textDisplay(content) {
  return new TextDisplayBuilder().setContent(String(content || 'None').slice(0, 4000));
}

function pageFieldsToText(fields = []) {
  if (!fields.length) return '';
  return fields.map(f => `**${f.name}**\n${f.value}`).join('\n\n');
}

function buildAccountContainer(target, pageData, page, totalPages, prefix, disabled = false) {
  const headerText = [
    `## ${pageData.title}`,
    pageData.description || `<@${target.id}>\n\`${target.id}\``,
  ].join('\n');
  const bodyText = pageData.fields?.length ? pageFieldsToText(pageData.fields) : pageData.description;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:prev`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 0),
    new ButtonBuilder()
      .setCustomId(`${prefix}:next`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages - 1),
  );

  const container = new ContainerBuilder()
    .setAccentColor(parseColor(config.Embed_Color))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(textDisplay(headerText))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(target.displayAvatarURL({ size: 256, extension: 'png' })),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (bodyText) container.addTextDisplayComponents(textDisplay(bodyText));

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(textDisplay(`Page ${page + 1}/${totalPages}`))
    .addActionRowComponents(row);

  return container;
}

function buildPages(target) {
  const id = target.id;
  const access = getAccess(id);
  const eco = loadJSON(paths.economy, {})[id] || {};
  const xp = loadJSON(paths.xp, {})[id] || {};
  const roblox = getRobloxClaim(id);
  const usage = getCommandUsage(id);
  const blacklist = loadJSON(paths.blacklist, { users: {}, guilds: {} });
  const audit = loadJSON(paths.audit, { users: {} });
  const languages = loadJSON(paths.userLanguages, {});
  const dmSettings = loadJSON(paths.dmSettings, {});
  const layouts = loadJSON(paths.layouts, {});
  const avatarHistory = loadJSON(paths.avatarHistory, {});
  const auras = loadJSON(paths.aura, {});
  const notes = loadJSON(paths.notes, {});
  const stock = getStockStats(eco);
  const auditCount = Array.isArray(audit.users?.[id]) ? audit.users[id].length : 0;
  const avatarCount = Array.isArray(avatarHistory[id]) ? avatarHistory[id].length : 0;
  const noteCount = Array.isArray(notes[id]) ? notes[id].length : Object.keys(notes[id] || {}).length;
  const passiveSources = Array.isArray(eco.passive?.sources) ? eco.passive.sources : [];
  const totalPassive = passiveSources.reduce((sum, source) => sum + Number(source.incomePerHour || 0), 0);
  const topCommands = usage.top.length
    ? usage.top.map(([name, count], i) => `${i + 1}. /${name} - **${formatNumber(count)}**`).join('\n')
    : 'No command usage recorded.';
  const robloxText = roblox
    ? `**${roblox.robloxDisplayName || roblox.robloxUsername}** (@${roblox.robloxUsername})\nID: \`${roblox.robloxUserId}\`\nPlan: **${String(roblox.highestPlan || 'unknown').toUpperCase()}**\nVerified: ${formatDate(roblox.verifiedAt)}`
    : 'No Roblox account is linked. A Roblox account is linked when the user verifies through `/plus buy` with Robux. Users granted by key, Discord SKU, or admin may not have one.';

  return [
    {
      title: `${target.username}'s Account`,
      description: `<@${id}>\n\`${id}\``,
      fields: [
        field('Access', access),
        field('Bot Account', boolText(target.bot)),
        field('Blacklisted', boolText(Boolean(blacklist.users?.[id]))),
        field('Created', `<t:${Math.floor(target.createdTimestamp / 1000)}:F>`, false),
      ],
    },
    {
      title: 'Economy',
      fields: [
        field('Wallet', formatMoney(eco.cash)),
        field('Bank', formatMoney(eco.bank)),
        field('Total', formatMoney(Number(eco.cash || 0) + Number(eco.bank || 0))),
        field('Upgrades', formatNumber(Array.isArray(eco.upgrades) ? eco.upgrades.length : 0)),
        field('Passive Sources', formatNumber(passiveSources.length)),
        field('Passive / Hour', formatMoney(totalPassive)),
        field('Join Bonus', boolText(eco.joinedBonus)),
        field('Last Work', formatDate(eco.lastWork)),
        field('Last Daily', formatDate(eco.lastDaily)),
        field('Last Bonus', formatDate(eco.lastBonus)),
        field('Last Plus Monthly', formatDate(eco.lastMonthlyPlus)),
      ],
    },
    {
      title: 'Roblox',
      description: robloxText,
      fields: [],
    },
    {
      title: 'Command Usage',
      fields: [
        field('Total Commands', formatNumber(usage.total)),
        field('Last Command', usage.last ? `/${usage.last.command}${usage.last.subcommand ? ` ${usage.last.subcommand}` : ''}\n<t:${Math.floor(usage.last.at / 1000)}:R>` : 'Never', false),
        field('Top Commands', topCommands, false),
      ],
    },
    {
      title: 'Stats & Settings',
      fields: [
        field('XP', formatNumber(xp.xp)),
        field('Level', formatNumber(xp.level)),
        field('Aura', formatNumber(auras[id] || 0)),
        field('Language', languageName(languages[id])),
        field('DMs Enabled', dmSettings[id] === undefined ? 'Default' : boolText(dmSettings[id])),
        field('Custom Theme', boolText(Boolean(layouts[id]))),
        field('Saved Notes', formatNumber(noteCount)),
        field('Avatar History', formatNumber(avatarCount)),
        field('Admin Audit Entries', formatNumber(auditCount)),
      ],
    },
    {
      title: 'Stock Games',
      fields: [
        field('Total Bets', formatNumber(stock.total)),
        field('Wins', formatNumber(stock.wins)),
        field('Losses', formatNumber(stock.losses)),
        field('Net Gain', formatSignedMoney(stock.net)),
      ],
    },
  ];
}


async function showAccount(interaction, targetUser) {
  const target = targetUser || interaction.options?.getUser?.('user') || interaction.targetUser || interaction.user;
  trackAvatar(target);
  const pages = buildPages(target);
  let page = 0;
  const prefix = `account:${interaction.id}`;

  function render(disabled = false) {
    const pageData = pages[page];
    return {
      content: null,
      embeds: [],
      flags: MessageFlags.IsComponentsV2,
      components: [buildAccountContainer(target, pageData, page, pages.length, prefix, disabled)],
    };
  }

  const msg = await interaction.editReply(render());
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120000,
    filter: i => i.user.id === interaction.user.id && i.customId.startsWith(prefix),
  });

  collector.on('collect', async i => {
    page += i.customId.endsWith(':next') ? 1 : -1;
    page = Math.max(0, Math.min(pages.length - 1, page));
    await i.update(render()).catch(() => {});
  });

  collector.on('end', async () => {
    interaction.editReply(render(true)).catch(() => {});
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('account')
    .setDescription('View stored leaf account details')
    .addUserOption(opt => opt.setName('user').setDescription('User to view').setRequired(false)),
  category: 'Utility',
  execute: showAccount,
  showAccount,
};


