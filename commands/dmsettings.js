const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const settingsPath = path.join(__dirname, '../data/DMSettings.json');

function loadSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function saveSettings(data) {
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dmsettings')
    .setDescription('Control if others can DM you using the bot')
    .addSubcommand(sub =>
      sub.setName('toggle')
        .setDescription('Turn bot DMs on or off')
        .addStringOption(opt =>
          opt.setName('mode')
            .setDescription('Enable or disable DMs')
            .setRequired(true)
            .addChoices(
              { name: 'On (Default)', value: 'on' },
              { name: 'Off', value: 'off' }
            )
        )
    ),

  category: 'Settings',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();
    const settings = loadSettings();
    const embed = await getUserEmbed(userId, 'DM Settings');

    if (sub === 'toggle') {
      const mode = interaction.options.getString('mode');
      settings[userId] = mode === 'on';

      const title = await translateText('DM Settings Updated', lang);
      const msg = await translateText(
        mode === 'on'
          ? 'You can now receive DMs from this bot.'
          : 'You have disabled DMs from this bot.',
        lang
      );

      embed.setTitle('✅ ' + title).setDescription(`${msg}`);
    }

    saveSettings(settings);
    await interaction.editReply({ embeds: [embed] });
  }
};
