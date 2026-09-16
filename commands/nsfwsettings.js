const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const settingsPath = path.join(__dirname, '../data/nsfw.json');

function loadSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function saveSettings(data) {
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nsfwsettings')
    .setDescription('Toggle whether NSFW commands are allowed for you')
    .setDMPermission(false)
    .addStringOption(opt =>
      opt
        .setName('mode')
        .setDescription('Enable or disable NSFW commands for yourself')
        .setRequired(true)
        .addChoices(
          { name: 'Off (Default)', value: 'off' },
          { name: 'On', value: 'on' },
        ),
    ),

  category: 'Settings',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const userId = interaction.user.id;
    const mode = interaction.options.getString('mode');

    const settings = loadSettings();
    if (!settings[userId]) {
      settings[userId] = { enabled: false };
    }

    settings[userId].enabled = mode === 'on';
    saveSettings(settings);

    const title = await translateText('NSFW Settings Updated', lang);
    const msg = mode === 'on'
      ? await translateText('You have enabled NSFW commands for yourself.', lang)
      : await translateText('You have disabled NSFW commands for yourself.', lang);

    const embed = await getUserEmbed(userId, 'NSFW Settings');
    embed.setTitle(title).setDescription(`✅ ${msg}`);

    return interaction.editReply({ embeds: [embed] });
  },
};
