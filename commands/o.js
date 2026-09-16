const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserEmbed } = require('../utils/getUserEmbed');
const { abbreviate } = require('../utils/abbreviate');
const { grantPlus, removePlus, parseDuration, isPlusActive, cleanupExpiredPlus } = require('../utils/plusAccess');

const commandFolders = ['commands', 'plusCommands', 'clickCommands', 'plusClickCommands', 'helpCommands'];
const adminsPath = path.join(__dirname, '..', 'data', 'admins.json');
const economyPath = path.join(__dirname, '..', 'data', 'economy.json');
const plusPath = path.join(__dirname, '..', 'data', 'plusUsers.json');
const plusExpirationsPath = path.join(__dirname, '..', 'data', 'plusExpirations.json');
const blacklistPath = path.join(__dirname, '..', 'data', 'blacklist.json');
const lockedPath = path.join(__dirname, '..', 'data', 'lockedCommands.json');
const analyticsPath = path.join(__dirname, '..', 'data', 'commandAnalytics.json');
const auditPath = path.join(__dirname, '..', 'data', 'adminAudit.json');
const welcomeDmsPath = path.join(__dirname, '..', 'data', 'welcomeDms.json');
const plusKeysPath = path.join(__dirname, '..', 'data', 'plus_keys.json');

function loadJSON(file, fallback = {}) {
  try { if (!fs.existsSync(file)) return fallback; return JSON.parse(fs.readFileSync(file, 'utf8') || JSON.stringify(fallback)); } catch { return fallback; }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function isOwner(userId) { return userId === config.Owner_ID; }
function isAdminOrOwner(userId) { return isOwner(userId) || loadJSON(adminsPath)[userId] === true; }
function cleanCommandName(value) { return String(value || '').trim().replace(/^\//, '').toLowerCase(); }
function randomKey(plan) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 24; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return plan + '_' + token;
}
function keyRows() { return loadJSON(plusKeysPath, []); }
function saveKeyRows(rows) { saveJSON(plusKeysPath, rows); }
function collectKnownUserIds() {
  cleanupExpiredPlus();
  const ids = new Set();
  const addObjectKeys = obj => Object.keys(obj || {}).forEach(id => /^\d{15,25}$/.test(id) && ids.add(id));
  addObjectKeys(loadJSON(plusPath, {}));
  addObjectKeys(loadJSON(welcomeDmsPath, {}));
  addObjectKeys(loadJSON(economyPath, {}));
  addObjectKeys(loadJSON(path.join(__dirname, '..', 'data', 'xp.json'), {}));
  addObjectKeys(loadJSON(analyticsPath, { users: {} }).users || {});
  return [...ids];
}

function commandFiles() {
  const rows = [];
  for (const folder of commandFolders) {
    const dir = path.join(__dirname, '..', folder);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.js'))) {
      try {
        const full = path.join(dir, file);
        const cmd = require(full);
        if (!cmd || cmd.hidden || !cmd.data || !cmd.data.name) continue;
        rows.push({ folder, file, name: cmd.data.name, full });
      } catch {}
    }
  }
  return rows;
}
function commandNames() { return [...new Set(commandFiles().map(row => row.name))].sort(); }
function loadCommand(fullPath, client) {
  delete require.cache[require.resolve(fullPath)];
  const command = require(fullPath);
  if (!command || command.hidden || !command.data || !command.data.name) return null;
  client.commands.set(command.data.name, command);
  return command;
}
async function deny(interaction, text) {
  const embed = await getUserEmbed(interaction.user.id, null, 'error');
  embed.setDescription(text);
  return interaction.editReply({ embeds: [embed] });
}
function asOriginalOptions(interaction, subcommand, group = null) {
  const original = interaction.options;
  interaction.options = new Proxy(original, {
    get(target, prop) {
      if (prop === 'getSubcommand') return () => subcommand;
      if (prop === 'getSubcommandGroup') return () => group;
      return Reflect.get(target, prop);
    }
  });
  return () => { interaction.options = original; };
}
async function forward(interaction, file, subcommand, group = null) {
  const mod = require(`./${file}`);
  const restore = asOriginalOptions(interaction, subcommand, group);
  try { return await mod.execute(interaction); } finally { restore(); }
}
function initEco(data, id) {
  if (!data[id]) data[id] = { cash: 0, bank: 0, lastWork: 0, lastDaily: 0, lastBeg: 0, upgrades: [], passive: { sources: [], lastPayout: 0 } };
  if (typeof data[id].cash !== 'number') data[id].cash = 0;
  if (typeof data[id].bank !== 'number') data[id].bank = 0;
  return data[id];
}
function analyticsEntries() {
  const data = loadJSON(analyticsPath, { commands: {}, users: {}, events: [] });
  return Array.isArray(data.events) ? data.events : [];
}
function formatTopUsers(users = {}) {
  const rows = Object.entries(users).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return rows.length ? rows.map(([id, count], i) => `${i + 1}. <@${id}> - **${count}**`).join('\n') : 'No users yet';
}
function paginateLines(lines, page = 1, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(lines.length / pageSize));
  const safePage = Math.max(1, Math.min(totalPages, page));
  return { totalPages, page: safePage, lines: lines.slice((safePage - 1) * pageSize, safePage * pageSize) };
}
function pageButtons(prefix, page, totalPages) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}_prev`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`${prefix}_next`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages),
  )];
}
function compactLogValue(value) {
  if (value === null || value === undefined || value === '') return 'None';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 120);
  return String(value).slice(0, 120);
}
function buildLogLines(type) {
  if (type === 'analytics') {
    return analyticsEntries().slice().reverse().map(event => {
      const when = `<t:${Math.floor(Number(event.at || Date.now()) / 1000)}:R>`;
      const path = '/' + [event.command, event.subcommand].filter(Boolean).join(' ');
      return `${when} **${path}**\nUser: <@${event.userId}>\nChat: ${event.guildId ? '`' + event.guildId + '`' : 'DM / User App'}`;
    });
  }
  if (type === 'audit') {
    const audit = loadJSON(auditPath, { users: {} });
    const rows = [];
    for (const [targetId, entries] of Object.entries(audit.users || {})) {
      for (const entry of entries || []) rows.push({ targetId, ...entry });
    }
    return rows.sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).map(entry => {
      const when = `<t:${Math.floor(Number(entry.at || Date.now()) / 1000)}:R>`;
      return `${when} **${compactLogValue(entry.action)}**\nTarget: <@${entry.targetId}> | By: <@${entry.by}>\nCommand: \`/${compactLogValue(entry.command || 'o')}\``;
    });
  }
  if (type === 'plus') {
    const plus = loadJSON(plusPath, {});
    const expirations = loadJSON(plusExpirationsPath, {});
    return Object.keys(plus).sort().map(id => {
      const exp = expirations[id];
      const until = exp?.expiresAt ? `<t:${Math.floor(Number(exp.expiresAt) / 1000)}:R>` : 'Lifetime';
      return `<@${id}>\nStatus: **Plus** | Expires: **${until}**\nSource: ${compactLogValue(exp?.source || exp?.label || 'manual/lifetime')}`;
    });
  }
  if (type === 'blacklist') {
    const blacklist = loadJSON(blacklistPath, { users: {}, guilds: {} });
    const rows = [];
    for (const [id, entry] of Object.entries(blacklist.users || {})) rows.push(`User: <@${id}>\nReason: ${compactLogValue(entry.reason)}\nBy: <@${entry.by || '0'}>`);
    for (const [id, entry] of Object.entries(blacklist.guilds || {})) rows.push(`Chat/Guild: \`${id}\`\nReason: ${compactLogValue(entry.reason)}\nBy: <@${entry.by || '0'}>`);
    return rows;
  }
  const files = [analyticsPath, auditPath, plusPath, plusExpirationsPath, blacklistPath, lockedPath, plusKeysPath, economyPath];
  return files.map(file => {
    const stat = fs.existsSync(file) ? fs.statSync(file) : null;
    return `**${path.basename(file)}**\nSize: ${stat ? stat.size.toLocaleString('en-US') + ' bytes' : 'missing'}\nUpdated: ${stat ? '<t:' + Math.floor(stat.mtimeMs / 1000) + ':R>' : 'never'}`;
  });
}

function auditAction(interaction, targetId, action, details = {}) {
  if (!targetId) return;
  const data = loadJSON(auditPath, { users: {} });
  if (!data.users) data.users = {};
  if (!Array.isArray(data.users[targetId])) data.users[targetId] = [];
  data.users[targetId].push({
    at: Date.now(),
    by: interaction.user.id,
    command: `o ${interaction.options.getSubcommandGroup(false) || ''} ${interaction.options.getSubcommand()}`.replace(/\s+/g, ' ').trim(),
    action,
    details,
  });
  if (data.users[targetId].length > 250) data.users[targetId] = data.users[targetId].slice(-250);
  saveJSON(auditPath, data);
}
function knownUserIdsByLicense(mode) {
  cleanupExpiredPlus();
  const plus = loadJSON(plusPath, {});
  if (mode === 'plus') return Object.keys(plus).filter(id => plus[id] === true);
  return collectKnownUserIds();
}
async function sendAdminDm(interaction, ids, message, title = 'leaf Admin Message') {
  const uniqueIds = [...new Set(ids)].filter(id => /^\d{15,25}$/.test(id) && id !== interaction.client.user.id);
  const dmEmbed = await getUserEmbed(interaction.user.id, title);
  dmEmbed.setDescription(message);
  dmEmbed.setFooter({ text: `Sent by ${interaction.user.username}` });
  let sent = 0;
  let failed = 0;
  for (const id of uniqueIds) {
    try {
      const user = await interaction.client.users.fetch(id);
      if (!user || user.bot) { failed++; continue; }
      await user.send({ embeds: [dmEmbed] });
      sent++;
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch {
      failed++;
    }
  }
  return { tried: uniqueIds.length, sent, failed };
}
async function renderPagedLines(interaction, title, lines, pageSize = 8) {
  let page = 1;
  const prefix = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${interaction.id}`.slice(0, 80);
  async function renderPage() {
    const pageData = paginateLines(lines, page, pageSize);
    const embed = await getUserEmbed(interaction.user.id, title);
    embed.setDescription(pageData.lines.join('\n\n') || 'No entries found.').setFooter({ text: `Page ${pageData.page}/${pageData.totalPages}` });
    return { embed, totalPages: pageData.totalPages };
  }
  const first = await renderPage();
  const msg = await interaction.editReply({ embeds: [first.embed], components: first.totalPages > 1 ? pageButtons(prefix, page, first.totalPages) : [] });
  if (first.totalPages <= 1) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000, filter: i => i.user.id === interaction.user.id && i.customId.startsWith(prefix) });
  collector.on('collect', async i => {
    page += i.customId.endsWith('_next') ? 1 : -1;
    const next = await renderPage();
    await i.update({ embeds: [next.embed], components: pageButtons(prefix, page, next.totalPages) });
  });
  collector.on('end', async () => {
    const last = await renderPage().catch(() => null);
    if (last) interaction.editReply({ components: pageButtons(prefix, page, last.totalPages).map(row => { row.components.forEach(btn => btn.setDisabled(true)); return row; }) }).catch(() => {});
  });
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName('o')
    .setDescription('Admin and owner commands')
    .addSubcommandGroup(group => group.setName('message').setDescription('Owner DM message tools')
      .addSubcommand(sub => sub.setName('user').setDescription('DM one user').addUserOption(opt => opt.setName('user').setDescription('User to message').setRequired(true)).addStringOption(opt => opt.setName('message').setDescription('Message').setRequired(true).setMaxLength(1800)))
      .addSubcommand(sub => sub.setName('licensed').setDescription('DM Plus users').addStringOption(opt => opt.setName('message').setDescription('Message').setRequired(true).setMaxLength(1800)))
      .addSubcommand(sub => sub.setName('all').setDescription('DM all known users').addStringOption(opt => opt.setName('message').setDescription('Message').setRequired(true).setMaxLength(1800))))
    .addSubcommandGroup(group => group.setName('audit').setDescription('View admin actions made on users')
      .addSubcommand(sub => sub.setName('user').setDescription('View admin audit log for a user').addUserOption(opt => opt.setName('user').setDescription('User to audit').setRequired(true))))
    .addSubcommandGroup(group => group.setName('logs').setDescription('View owner logs')
      .addSubcommand(sub => sub.setName('view').setDescription('View recent logs')
        .addStringOption(opt => opt.setName('type').setDescription('Log type').setRequired(false).addChoices(
          { name: 'Analytics', value: 'analytics' },
          { name: 'Admin Audit', value: 'audit' },
          { name: 'Plus', value: 'plus' },
          { name: 'Blacklist', value: 'blacklist' },
          { name: 'System Files', value: 'system' }
        ))))
    .addSubcommandGroup(group => group.setName('reload').setDescription('Reload commands')
      .addSubcommand(sub => sub.setName('all').setDescription('Reload all commands'))
      .addSubcommand(sub => sub.setName('command').setDescription('Reload one command').addStringOption(opt => opt.setName('target').setDescription('Command to reload').setRequired(true).setAutocomplete(true))))
    .addSubcommandGroup(group => group.setName('adminsay').setDescription('Admin say commands')
      .addSubcommand(sub => sub.setName('send').setDescription('Make the bot send a message or embed')
        .addStringOption(opt => opt.setName('type').setDescription('Message type').setRequired(true).addChoices({ name: 'Normal', value: 'normal' }, { name: 'Embed', value: 'embed' }))
        .addStringOption(opt => opt.setName('title').setDescription('Optional title/content').setRequired(false))
        .addStringOption(opt => opt.setName('description').setDescription('Optional description/content').setRequired(false).setMaxLength(2000))
        .addStringOption(opt => opt.setName('author').setDescription('Optional embed author').setRequired(false))))
    .addSubcommandGroup(group => group.setName('staff').setDescription('Staff support commands')
      .addSubcommand(sub => sub.setName('support').setDescription('Manage support requests')
        .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'resolve', value: 'resolve' }, { name: 'fixing', value: 'fixing' }, { name: 'message', value: 'message' }, { name: 'delete', value: 'delete' }))
        .addUserOption(o => o.setName('user').setDescription('The user who sent the report').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Custom message for message action').setRequired(false))))
    .addSubcommandGroup(group => group.setName('xp').setDescription('XP admin commands')
      .addSubcommand(cmd => cmd.setName('setxp').setDescription('Set XP of a user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP').setRequired(true)))
      .addSubcommand(cmd => cmd.setName('addxp').setDescription('Add XP to a user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Amount to add').setRequired(true)))
      .addSubcommand(cmd => cmd.setName('removexp').setDescription('Remove XP from a user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Amount to remove').setRequired(true)))
      .addSubcommand(cmd => cmd.setName('setlevel').setDescription('Set level of a user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('level').setDescription('Level to set').setRequired(true)))
      .addSubcommand(cmd => cmd.setName('addlevel').setDescription('Add level to a user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Levels to add').setRequired(true)))
      .addSubcommand(cmd => cmd.setName('removelevel').setDescription('Remove level from a user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Levels to remove').setRequired(true)))
      .addSubcommand(cmd => cmd.setName('resetxp').setDescription('Reset XP and level of a user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))))
    .addSubcommandGroup(group => group.setName('eco').setDescription('Economy owner controls')
      .addSubcommand(sub => sub.setName('resetall').setDescription('Reset wallet and bank').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(sub => sub.setName('resetbank').setDescription('Reset bank').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(sub => sub.setName('resetwallet').setDescription('Reset wallet').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(sub => sub.setName('setbank').setDescription('Set bank').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(0)))
      .addSubcommand(sub => sub.setName('setwallet').setDescription('Set wallet').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(0))))
    .addSubcommandGroup(group => group.setName('keys').setDescription('Create and list redeem keys')
      .addSubcommand(sub => sub.setName('create').setDescription('Create Plus redeem keys').addIntegerOption(opt => opt.setName('amount').setDescription('Amount, 1-5').setRequired(true).setMinValue(1).setMaxValue(5)))
      .addSubcommand(sub => sub.setName('list').setDescription('List Plus redeem keys')))
    .addSubcommandGroup(group => group.setName('grant').setDescription('Grant or remove access')
      .addSubcommand(sub => sub.setName('add').setDescription('Grant Plus access').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addStringOption(opt => opt.setName('duration').setDescription('Duration, e.g. 30d, 1mo, monthly, lifetime').setRequired(false)))
      .addSubcommand(sub => sub.setName('remove').setDescription('Remove Plus access').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))))
    .addSubcommandGroup(group => group.setName('blacklist').setDescription('Blacklist users or guilds')
      .addSubcommand(sub => sub.setName('manage').setDescription('Add or remove a blacklist entry')
        .addStringOption(opt => opt.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
        .addUserOption(opt => opt.setName('user').setDescription('User to blacklist').setRequired(false))
        .addStringOption(opt => opt.setName('guild_id').setDescription('Guild ID to blacklist').setRequired(false))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(500))
        .addStringOption(opt => opt.setName('silent').setDescription('Blacklist without sending DM?').setRequired(false).addChoices({ name: 'Yes', value: 'yes' }, { name: 'No', value: 'no' }))))
    .addSubcommandGroup(group => group.setName('analytics').setDescription('Command usage analytics')
      .addSubcommand(sub => sub.setName('view').setDescription('View command analytics')
        .addUserOption(opt => opt.setName('user').setDescription('User to view stats for').setRequired(false))
        .addStringOption(opt => opt.setName('command').setDescription('Filter by command').setRequired(false).setAutocomplete(true))
        .addBooleanOption(opt => opt.setName('ephemeral').setDescription('Send ephemerally').setRequired(false))))
    .addSubcommandGroup(group => group.setName('lock').setDescription('Lock or unlock commands')
      .addSubcommand(sub => sub.setName('command').setDescription('Toggle command lock').addStringOption(opt => opt.setName('name').setDescription('Command name').setRequired(true).setAutocomplete(true)))
      .addSubcommand(sub => sub.setName('list').setDescription('List locked commands')))
    .addSubcommandGroup(group => group.setName('bot').setDescription('Owner bot controls')
      .addSubcommand(sub => sub.setName('shutdown').setDescription('Stop the bot'))),
  category: 'Owner',

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = commandNames().filter(name => !focused || name.toLowerCase().includes(focused)).slice(0, 25).map(name => ({ name, value: name }));
    return interaction.respond(choices).catch(() => {});
  },

  async execute(interaction) {
    const userId = interaction.user.id;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    if (!isAdminOrOwner(userId)) return deny(interaction, 'This command is only available to admins or the bot owner.');

    if (group === 'message') {
      if (!isOwner(userId)) return deny(interaction, 'Only the bot owner can send admin messages.');
      const message = interaction.options.getString('message');
      let ids = [];
      let title = 'leaf Admin Message';
      if (sub === 'user') {
        const target = interaction.options.getUser('user');
        ids = [target.id];
        title = 'leaf Admin Message';
        auditAction(interaction, target.id, 'message.user', { deliveredTo: target.id, preview: message.slice(0, 120) });
      } else if (sub === 'licensed') {
        ids = knownUserIdsByLicense('plus');
        title = 'leaf Plus Announcement';
      } else {
        ids = collectKnownUserIds();
        title = 'leaf Announcement';
      }
      const result = await sendAdminDm(interaction, ids, message, title);
      const embed = await getUserEmbed(userId, 'Messages Sent');
      embed.setDescription(`Tried **${result.tried}** users.\nSent: **${result.sent}**\nFailed: **${result.failed}**`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (group === 'logs') {
      if (!isOwner(userId)) return deny(interaction, 'Only the bot owner can view logs.');
      const type = interaction.options.getString('type') || 'analytics';
      const labels = { analytics: 'Analytics Logs', audit: 'Admin Audit Logs', plus: 'Plus Logs', blacklist: 'Blacklist Logs', system: 'System Logs' };
      const lines = buildLogLines(type);
      return renderPagedLines(interaction, labels[type] || 'Logs', lines, 6);
    }

    if (group === 'audit') {
      if (!isOwner(userId)) return deny(interaction, 'Only the bot owner can view audit logs.');
      const target = interaction.options.getUser('user');
      const data = loadJSON(auditPath, { users: {} });
      const entries = Array.isArray(data.users?.[target.id]) ? [...data.users[target.id]].reverse() : [];
      const lines = entries.map(entry => {
        const when = `<t:${Math.floor((entry.at || Date.now()) / 1000)}:f>`;
        const details = entry.details && Object.keys(entry.details).length
          ? Object.entries(entry.details).map(([key, value]) => `${key}: ${String(value).slice(0, 80)}`).join(' • ')
          : 'No details';
        return `${when}\nBy: <@${entry.by}>\nAction: **${entry.action || 'unknown'}**\nCommand: \`/${entry.command || 'o'}\`\n${details}`;
      });
      return renderPagedLines(interaction, `${target.username}'s Audit`, lines, 5);
    }
    if (group === 'reload') {
      if (!isOwner(userId)) return deny(interaction, 'Only the bot owner can reload commands.');
      const embed = await getUserEmbed(userId, 'Owner Reload');
      embed.setTitle('Reload Commands');
      if (sub === 'command') {
        const target = interaction.options.getString('target');
        const match = commandFiles().find(row => row.name.toLowerCase() === target.toLowerCase());
        if (!match) return interaction.editReply({ embeds: [embed.setTitle('Command Not Found').setDescription(`Could not find \`${target}\`.`)] });
        try { const command = loadCommand(match.full, interaction.client); embed.setDescription(command ? `Reloaded \`${command.data.name}\`.` : `Reloaded \`${target}\`, but it is hidden from registration.`); }
        catch (error) { embed.setTitle('Reload Failed').setDescription(`\`\`\`${error.message}\`\`\``); }
        return interaction.editReply({ embeds: [embed] });
      }
      let reloaded = 0; const failed = [];
      for (const row of commandFiles()) { try { if (loadCommand(row.full, interaction.client)) reloaded++; } catch (error) { failed.push(`${row.folder}/${row.file}: ${error.message}`); } }
      embed.setDescription([`Reloaded **${reloaded}** commands.`, failed.length ? `\nFailed:\n${failed.slice(0, 8).map(line => `- ${line}`).join('\n')}` : ''].filter(Boolean).join('\n'));
      return interaction.editReply({ embeds: [embed] });
    }

    if (group === 'bot') { if (!isOwner(userId)) return deny(interaction, 'Only the bot owner can use bot controls.'); return forward(interaction, 'shutdown', null, null); }
    if (group === 'adminsay') return forward(interaction, 'adminsay', null, null);
    if (group === 'staff') {
      const target = interaction.options.getUser('user');
      if (target) auditAction(interaction, target.id, 'staff.support', { action: interaction.options.getString('action'), message: (interaction.options.getString('message') || '').slice(0, 120) });
      return forward(interaction, 'staff', 'support', null);
    }
    if (group === 'xp') {
      const target = interaction.options.getUser('user');
      if (target) auditAction(interaction, target.id, 'xp.' + sub, { amount: interaction.options.getInteger('amount'), level: interaction.options.getInteger('level') });
      return forward(interaction, 'xp', sub, null);
    }

    if (group === 'eco') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const data = loadJSON(economyPath, {});
      const eco = initEco(data, target.id);
      if (sub === 'resetall') { eco.cash = 0; eco.bank = 0; }
      if (sub === 'resetbank') eco.bank = 0;
      if (sub === 'resetwallet') eco.cash = 0;
      if (sub === 'setbank') eco.bank = amount;
      if (sub === 'setwallet') eco.cash = amount;
      saveJSON(economyPath, data);
      auditAction(interaction, target.id, 'eco.' + sub, { amount, wallet: eco.cash, bank: eco.bank });
      const embed = await getUserEmbed(userId, 'Eco Control');
      embed.setDescription(`Updated <@${target.id}>\nWallet: **${abbreviate(eco.cash, 'prefix')} Cash**\nBank: **${abbreviate(eco.bank, 'prefix')} Cash**`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (group === 'keys') {
      if (!isOwner(userId)) return deny(interaction, 'Only the bot owner can manage keys.');
      if (sub === 'create') {
        const amount = interaction.options.getInteger('amount');
        const rows = keyRows();
        const existing = new Set(rows.map(row => row.key));
        const created = [];
        while (created.length < amount) {
          const key = randomKey('plus');
          if (existing.has(key)) continue;
          existing.add(key);
          created.push(key);
          rows.push({ key, used: false });
        }
        saveKeyRows(rows);
        const embed = await getUserEmbed(userId, 'Keys Created');
        embed.setDescription(`Created **${created.length}** Plus key(s):\n\n${created.map(key => `\`${key}\``).join('\n')}`);
        return interaction.editReply({ embeds: [embed] });
      }

      const lines = [];
      const rows = keyRows().slice().sort((a, b) => Number(Boolean(a.used)) - Number(Boolean(b.used)));
      if (!rows.length) lines.push('**Plus**\nNo keys.');
      else rows.forEach((row, index) => lines.push(`**Plus #${index + 1}** ${row.used ? 'Used' : 'Unused'}\n\`${row.key}\``));
      let page = 1;
      const prefix = `keys_${interaction.id}`;
      async function renderPage() {
        const pageData = paginateLines(lines, page, 8);
        const embed = await getUserEmbed(userId, 'Redeem Keys');
        embed.setDescription(pageData.lines.join('\n\n') || 'No keys found.').setFooter({ text: `Page ${pageData.page}/${pageData.totalPages}` });
        return { embed, totalPages: pageData.totalPages };
      }
      const first = await renderPage();
      const msg = await interaction.editReply({ embeds: [first.embed], components: pageButtons(prefix, page, first.totalPages) });
      if (first.totalPages <= 1) return;
      const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000, filter: i => i.user.id === userId && i.customId.startsWith(prefix) });
      collector.on('collect', async i => {
        page += i.customId.endsWith('_next') ? 1 : -1;
        const next = await renderPage();
        await i.update({ embeds: [next.embed], components: pageButtons(prefix, page, next.totalPages) });
      });
      collector.on('end', async () => {
        const last = await renderPage().catch(() => null);
        if (last) interaction.editReply({ components: pageButtons(prefix, page, last.totalPages).map(row => { row.components.forEach(btn => btn.setDisabled(true)); return row; }) }).catch(() => {});
      });
      return;
    }
    if (group === 'grant') {
      if (!isOwner(userId)) return deny(interaction, 'Only the bot owner can grant or remove access.');
      const target = interaction.options.getUser('user');
      const duration = interaction.options.getString('duration');
      if (sub === 'add') {
        const expiresAt = parseDuration(duration);
        if (expiresAt === undefined) return deny(interaction, 'Invalid duration. Use values like `30d`, `1mo`, `monthly`, or `lifetime`.');
        grantPlus(target.id, { source: 'owner_grant', label: duration || 'lifetime', expiresAt });
      } else {
        removePlus(target.id);
      }
      auditAction(interaction, target.id, 'grant.' + sub, { status: 'plus', duration: duration || 'lifetime' });
      const embed = await getUserEmbed(userId, 'Grant Access');
      const until = sub === 'add' && duration && parseDuration(duration) ? `\nDuration: **${duration}**` : '';
      embed.setDescription(`${sub === 'add' ? 'Granted' : 'Removed'} **Plus** ${sub === 'add' ? 'to' : 'from'} <@${target.id}>.${until}`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (group === 'blacklist') {
      if (!isOwner(userId)) return deny(interaction, 'Only the bot owner can manage the blacklist.');
      const action = interaction.options.getString('action');
      const target = interaction.options.getUser('user');
      const guildId = interaction.options.getString('guild_id');
      const reason = interaction.options.getString('reason') || 'No reason provided.';
      const silent = interaction.options.getString('silent') === 'yes';
      if (!target && !guildId) return deny(interaction, 'Provide a user or guild_id.');
      const data = loadJSON(blacklistPath, { users: {}, guilds: {} });
      if (!data.users) data.users = {}; if (!data.guilds) data.guilds = {};
      const entry = { reason, by: userId, at: Date.now() };
      if (target) {
        if (action === 'add') data.users[target.id] = entry; else delete data.users[target.id];
        auditAction(interaction, target.id, 'blacklist.' + action, { reason, silent });
        if (!silent) target.send({ embeds: [(await getUserEmbed(target.id, 'Blacklist')).setDescription(action === 'add' ? `You were blacklisted.\nReason: **${reason}**` : `You were removed from the blacklist.\nReason: **${reason}**`)] }).catch(() => null);
      }
      if (guildId) { if (action === 'add') data.guilds[guildId] = entry; else delete data.guilds[guildId]; }
      saveJSON(blacklistPath, data);
      const embed = await getUserEmbed(userId, 'Blacklist');
      embed.setDescription(`${action === 'add' ? 'Added' : 'Removed'} blacklist entry${target ? ` for <@${target.id}>` : ''}${guildId ? ` for guild \`${guildId}\`` : ''}.`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (group === 'analytics') {
      const target = interaction.options.getUser('user');
      const command = cleanCommandName(interaction.options.getString('command'));
      const ephemeral = interaction.options.getBoolean('ephemeral') || false;
      const data = loadJSON(analyticsPath, { commands: {}, users: {}, events: [] });
      const embed = await getUserEmbed(userId, 'Analytics');
      if (target && !command) {
        const rows = Object.entries(data.users?.[target.id]?.commands || {}).sort((a, b) => b[1] - a[1]).map(([name, count]) => `/${name} - **${count}**`);
        const page = paginateLines(rows, 1, 12);
        embed.setTitle(`${target.username}'s Command Usage`).setDescription(page.lines.join('\n') || 'No usage recorded.').setFooter({ text: `Page ${page.page}/${page.totalPages}` });
      } else if (command) {
        const stats = data.commands?.[command] || { count: 0, users: {} };
        embed.setTitle(`/${command} Analytics`).setDescription(`Total uses: **${stats.count || 0}**\n\nTop users:\n${formatTopUsers(stats.users)}`);
      } else {
        const rows = Object.entries(data.commands || {}).sort((a, b) => (b[1].count || 0) - (a[1].count || 0)).map(([name, stats]) => `/${name} - **${stats.count || 0}**\nTop: ${formatTopUsers(stats.users).split('\n')[0]}`);
        const page = paginateLines(rows, 1, 8);
        embed.setTitle('Command Analytics').setDescription(page.lines.join('\n\n') || 'No usage recorded.').setFooter({ text: `Page ${page.page}/${page.totalPages}` });
      }
      return interaction.editReply({ embeds: [embed], ephemeral });
    }

    if (group === 'lock') {
      if (!isOwner(userId)) return deny(interaction, 'Only the bot owner can lock commands.');
      const data = loadJSON(lockedPath, {});
      const embed = await getUserEmbed(userId, 'Command Lock');
      if (sub === 'list') {
        const locked = Object.keys(data).filter(name => data[name]);
        embed.setDescription(locked.length ? locked.map(name => `/${name}`).join('\n') : 'No locked commands.');
        return interaction.editReply({ embeds: [embed] });
      }
      const name = cleanCommandName(interaction.options.getString('name'));
      if (!commandNames().includes(name)) return deny(interaction, 'That command does not exist.');
      data[name] = !data[name];
      saveJSON(lockedPath, data);
      embed.setDescription(`/${name} is now **${data[name] ? 'locked' : 'unlocked'}**.`);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};









