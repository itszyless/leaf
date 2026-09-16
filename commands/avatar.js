const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const historyPath = path.join(__dirname, '..', 'data', 'avatarHistory.json');
const historySettingsPath = path.join(__dirname, '..', 'data', 'avatarHistorySettings.json');

function loadHistory() {
  try {
    if (!fs.existsSync(historyPath)) return {};
    return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveHistory(data) {
  fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

function loadHistorySettings() {
  try {
    if (!fs.existsSync(historySettingsPath)) return {};
    return JSON.parse(fs.readFileSync(historySettingsPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveHistorySettings(data) {
  fs.writeFileSync(historySettingsPath, JSON.stringify(data, null, 2));
}

function canViewAvatarHistory(viewerId, targetId) {
  if (String(viewerId) === String(targetId)) return true;
  const settings = loadHistorySettings();
  return settings[targetId]?.public !== false;
}

function trackAvatar(user) {
  if (!user || user.bot) return;
  const avatarKey = user.avatar || `default:${user.discriminator || user.id}`;
  const url = user.displayAvatarURL({ size: 1024, dynamic: true });
  const history = loadHistory();
  const list = Array.isArray(history[user.id]) ? history[user.id] : [];

  if (list[0]?.key !== avatarKey && list[0]?.url !== url) {
    list.unshift({ key: avatarKey, url, seenAt: Date.now() });
    history[user.id] = list.slice(0, 25);
    saveHistory(history);
  }
}

async function showAvatar(interaction) {
  const userLang = getUserLanguage(interaction.user.id) || 'en';
  const user = interaction.options.getUser('user') || interaction.user;
  const format = interaction.options.getString('format');

  trackAvatar(user);

  let avatarURL;
  if (!format) {
    avatarURL = user.displayAvatarURL({ size: 1024, dynamic: true });
  } else if (format === 'gif') {
    avatarURL = user.avatar?.startsWith('a_')
      ? user.displayAvatarURL({ size: 1024, extension: 'gif', dynamic: false })
      : user.displayAvatarURL({ size: 1024, extension: 'png', dynamic: false });
  } else {
    avatarURL = user.displayAvatarURL({ size: 1024, extension: format, dynamic: false });
    avatarURL = avatarURL.replace(/\.gif(\?.*)?$/, `.${format}$1`);
  }

  const p1 = await translateText('Avatar', userLang);
  const title = `${user.username}'s ${p1}`;
  const clickHereText = await translateText('Click here', userLang);
  const viewAvatarText = await translateText('to view the avatar in browser.', userLang);

  const embed = (await getUserEmbed(interaction.user.id, 'Avatar'))
    .setTitle(title)
    .setDescription(`[${clickHereText}](${avatarURL}) ${viewAvatarText}`)
    .setImage(avatarURL);

  await interaction.editReply({ embeds: [embed] });
}

async function showHistory(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  trackAvatar(user);

  if (!canViewAvatarHistory(interaction.user.id, user.id)) {
    const err = await getUserEmbed(interaction.user.id, null, 'error');
    err.setDescription('This user has disabled public avatar history.');
    return interaction.editReply({ embeds: [err] });
  }

  const history = loadHistory();
  const list = history[user.id] || [];

  if (list.length === 0) {
    const err = await getUserEmbed(interaction.user.id, null, 'error');
    err.setDescription('No avatar history has been recorded for this user yet. History starts after the bot sees or checks a user.');
    return interaction.editReply({ embeds: [err] });
  }

  const embed = await getUserEmbed(interaction.user.id, 'Avatar History');
  embed
    .setTitle(`${user.username}'s Avatar History`)
    .setDescription(
      list.map((entry, index) =>
        `**${index + 1}.** [Open avatar](${entry.url}) - <t:${Math.floor(entry.seenAt / 1000)}:R>`
      ).join('\n')
    )
    .setImage(list[0].url);

  return interaction.editReply({ embeds: [embed] });
}


async function setHistoryVisibility(interaction) {
  const enabled = interaction.options.getBoolean('public');
  const settings = loadHistorySettings();
  settings[interaction.user.id] = { public: enabled };
  saveHistorySettings(settings);

  const embed = await getUserEmbed(interaction.user.id, 'Avatar History');
  embed.setDescription(enabled
    ? 'Other users can now view your avatar history.'
    : 'Other users can no longer view your avatar history.');
  return interaction.editReply({ embeds: [embed] });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDMPermission(true)
    .setDescription('Avatar tools.')
    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('Shows the avatar of a user or yourself.')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user to get the avatar of')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('format')
            .setDescription('Choose the image format')
            .setRequired(false)
            .addChoices(
              { name: 'GIF', value: 'gif' },
              { name: 'PNG', value: 'png' },
              { name: 'JPG', value: 'jpg' },
              { name: 'JPEG', value: 'jpeg' }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('history')
        .setDescription('Show recorded avatar history for a user.')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user to inspect')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('visibility')
        .setDescription('Allow or block others from viewing your avatar history.')
        .addBooleanOption(option =>
          option
            .setName('public')
            .setDescription('Allow other users to view your avatar history')
            .setRequired(true)
        )
    ),
  category: 'Image',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(false) || 'view';
    if (sub === 'history') return showHistory(interaction);
    if (sub === 'visibility') return setHistoryVisibility(interaction);
    return showAvatar(interaction);
  },

  trackAvatar
};

