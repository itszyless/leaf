const fs = require('fs');
const path = require('path');
const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');

const { getUserEmbed } = require('../utils/getUserEmbed');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { cleanupExpiredPlus, isPlusActive } = require('../utils/plusAccess');

const xpPath = path.join(__dirname, '..', 'data', 'xp.json');
const blacklistPath = path.join(__dirname, '..', 'data', 'blacklist.json');
const lockedCommandsPath = path.join(__dirname, '..', 'data', 'lockedCommands.json');
const analyticsPath = path.join(__dirname, '..', 'data', 'commandAnalytics.json');

function loadXPData() {
  if (!fs.existsSync(xpPath)) return {};
  return JSON.parse(fs.readFileSync(xpPath, 'utf8'));
}

function saveXPData(data) {
  fs.writeFileSync(xpPath, JSON.stringify(data, null, 2));
}


function loadJsonFile(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8') || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function saveJsonFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function commandKey(interaction) {
  return String(interaction.commandName || '').toLowerCase();
}

function recordCommandUsage(interaction) {
  if (!interaction?.isChatInputCommand?.()) return;
  const name = commandKey(interaction);
  if (!name) return;
  const data = loadJsonFile(analyticsPath, { commands: {}, users: {}, events: [] });
  if (!data.commands) data.commands = {};
  if (!data.users) data.users = {};
  if (!Array.isArray(data.events)) data.events = [];

  const userId = interaction.user.id;
  data.commands[name] ||= { count: 0, users: {} };
  data.commands[name].count += 1;
  data.commands[name].users[userId] = (data.commands[name].users[userId] || 0) + 1;

  data.users[userId] ||= { count: 0, commands: {} };
  data.users[userId].count += 1;
  data.users[userId].commands[name] = (data.users[userId].commands[name] || 0) + 1;

  data.events.push({
    userId,
    command: name,
    subcommand: interaction.options?.getSubcommand?.(false) || null,
    guildId: interaction.guildId || null,
    at: Date.now(),
  });
  if (data.events.length > 5000) data.events = data.events.slice(-5000);
  saveJsonFile(analyticsPath, data);
}

module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(bot, interaction) {
    cleanupExpiredPlus();

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('access:')) {
        const command = bot.commands.get('access');
        if (command && typeof command.handleModal === 'function') {
          return command.handleModal(interaction);
        }
      }

      if (interaction.customId.startsWith('plus_buy:')) {
        const command = bot.commands.get('plus');
        if (command && typeof command.handleModal === 'function') {
          return command.handleModal(interaction);
        }
      }

      if (interaction.customId.startsWith('fake_message:')) {
        if (!isPlusActive(interaction.user.id)) {
          return interaction.reply({
            content: 'This command is only available to plus users.',
            ephemeral: true,
          });
        }

        const command = bot.commands.get('Fake Message');
        if (command && typeof command.handleModal === 'function') {
          return command.handleModal(interaction);
        }
      }
    }

    if (interaction.isAutocomplete()) {
      const command = bot.commands.get(interaction.commandName);
      if (command && typeof command.autocomplete === 'function') {
        return command.autocomplete(interaction);
      }
      return interaction.respond([]).catch(() => {});
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('poll:')) {
        const command = interaction.client.commands.get('poll');
        if (command && typeof command.handleButton === 'function') {
          return command.handleButton(interaction);
        }
      }

      if (interaction.customId.startsWith('giveaway_join:')) {
        const command = interaction.client.commands.get('giveaway');
        if (command && typeof command.handleButton === 'function') {
          return command.handleButton(interaction);
        }
      }

      
      if (interaction.customId.startsWith('access_check:')) {
        const command = interaction.client.commands.get('access');
        if (command && typeof command.handleButton === 'function') {
          return command.handleButton(interaction);
        }
      }

      if (interaction.customId.startsWith('plus_buy:')) {
        const command = interaction.client.commands.get('plus');
        if (command && typeof command.handleButton === 'function') {
          return command.handleButton(interaction);
        }
      }
    }

    // only handle application commands
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isMessageContextMenuCommand() &&
      !interaction.isUserContextMenuCommand()
    ) return;

    const command = bot.commands.get(interaction.commandName);
    if (!command) return;

    try {
      const avatarCommand = bot.commands.get('avatar') || require('../commands/avatar');
      if (typeof avatarCommand.trackAvatar === 'function') {
        avatarCommand.trackAvatar(interaction.user);
        if (interaction.targetUser) avatarCommand.trackAvatar(interaction.targetUser);
      }
    } catch {}

    const lang = getUserLanguage(interaction.user.id) || 'en';

    // blacklist and command lock checks
    const blacklist = loadJsonFile(blacklistPath, { users: {}, guilds: {} });
    if (blacklist.users?.[interaction.user.id] || (interaction.guildId && blacklist.guilds?.[interaction.guildId])) {
      const entry = blacklist.users?.[interaction.user.id] || blacklist.guilds?.[interaction.guildId] || {};
      const embed = await getUserEmbed(interaction.user.id, null, 'error');
      embed.setDescription(`You are blacklisted from using this bot.\nReason: **${entry.reason || 'No reason provided.'}**`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const lockedCommands = loadJsonFile(lockedCommandsPath, {});
    if (interaction.commandName !== 'o' && lockedCommands[commandKey(interaction)]) {
      const embed = await getUserEmbed(interaction.user.id, null, 'error');
      embed.setDescription('This command is currently locked.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    recordCommandUsage(interaction);

    // paths for perms
    const adminsPath = path.join(__dirname, '..', 'data', 'admins.json');

    function isAdmin(userId) {
      if (!fs.existsSync(adminsPath)) return false;
      const data = JSON.parse(fs.readFileSync(adminsPath, 'utf8'));
      return data[userId] === true;
    }

    const userId = interaction.user.id;

    // XP gain block (same as before)
    try {
      if (!interaction.user.bot) {
        const xpData = loadXPData();
        if (!xpData[userId]) xpData[userId] = { xp: 0 };
        xpData[userId].xp += Math.floor(Math.random() * 8) + 3;
        saveXPData(xpData);
      }
    } catch (err) {
      // xp fail shouldn't break command
      console.error('XP update error:', err);
    }

    // helper: dynamic ephemeral mode from agents.json
    function getEphemeralValue(uid) {
      const agentsPath = path.join(__dirname, '..', 'agents.json');
      const config = require('../config.json');
      if (!fs.existsSync(agentsPath)) return config['Agent-Mode'];

      const agents = JSON.parse(fs.readFileSync(agentsPath, 'utf8'));
      return Object.prototype.hasOwnProperty.call(agents, uid)
        ? agents[uid]
        : config['Agent-Mode'];
    }

    try {
      // SPECIAL CASE COMMANDS (you had these if/else blocks)

      // GENERAL COMMAND FLOW (plus lock / admin lock / deferReply behavior)
      const ephemeral = getEphemeralValue(interaction.user.id);

      const isPlusCommand = command.category === 'Plus';
      const isAdminCommand = command.category === 'Admin';

      if (interaction.commandName === 'access') {
        return await command.execute(interaction);
      }
      // admin only?
      if (isAdminCommand && !isAdmin(interaction.user.id)) {
        const adminMsg = await translateText('This command is only available to admins.', lang);
        return await interaction.reply({
          embeds: [
            (await getUserEmbed(interaction.user.id, null, 'error'))
              .setDescription(adminMsg)
          ],
          ephemeral: true
        });
      }

      // plus only?
      if (isPlusCommand && !isPlusActive(interaction.user.id)) {
        const cfg = require('../config.json');
        const p1 = await translateText('This command is only available to plus users.', lang);
        const p2 = await translateText('Use **/plus buy** to unlock leaf Plus.', lang);
        const plusMsg = p1 + '\n' + p2;

        const plusButton = new ButtonBuilder()
          .setLabel('Plus')
          .setStyle(ButtonStyle.Link)
          .setURL(cfg.Plus?.PlusUrl || cfg.SupportServer);

        const row = new ActionRowBuilder().addComponents(plusButton);

        return await interaction.reply({
          embeds: [
            (await getUserEmbed(interaction.user.id, null, 'error'))
              .setDescription(plusMsg)
          ],
          components: [row],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'Fake Message') {
        return await command.execute(interaction);
      }

      if (interaction.commandName === 'agent') {
        return await command.execute(interaction);
      }

      if (interaction.commandName === 'spam') {
        await interaction.deferReply({ ephemeral: false });
        return await command.execute(interaction);
      }

      if (interaction.commandName === 'poll' || interaction.commandName === 'giveaway') {
        await interaction.deferReply({ ephemeral: false });
        return await command.execute(interaction);
      }

      if (interaction.commandName === 'game') {
        return await command.execute(interaction);
      }

      if(interaction.commandName === "nsfw") {
        await interaction.deferReply({ ephemeral: true });
        return await command.execute(interaction);
      }

      // normal flow
      await interaction.deferReply({ ephemeral });

      // add helper so your commands can just call interaction.ephemeralReply()
      interaction.ephemeralReply = (options) => {
        if (typeof options === 'string') options = { content: options };
        return interaction.editReply({ ...options });
      };

      await command.execute(interaction);

    } catch (err) {
      console.error('Command error:', err);

      // error response logic from your index.js
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({
          embeds: [
            (await getUserEmbed(interaction.user.id, null, 'error'))
              .setDescription('There was an error executing this command.')
          ],
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          embeds: [
            (await getUserEmbed(interaction.user.id, null, 'error'))
              .setDescription('There was an error executing this command.')
          ]
        });
      }
    }
  }
};















