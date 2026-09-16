const {
  SlashCommandBuilder
} = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Shows the current bot version.'),
  category: 'Utility',

  async execute(interaction) {
    try {
      const lang = (await getUserLanguage(interaction.user.id)) || 'en';
      const version = `v${config.Version || '1.0'}`;

      const embed = await getUserEmbed(interaction.user.id, 'Version');
      embed
        .setTitle(await translateText('?? Bot Version', lang))
        .setDescription(
          [
            `**${await translateText('Current Version', lang)}:** ${version}`,
            '',
            `**${await translateText('Update System', lang)}**`,
            `> ?? **+0.01** ? ${await translateText('Minor bugfixes or small tweaks', lang)}`,
            `> ?️ **+0.10** ? ${await translateText('Medium update, new features or visual changes', lang)}`,
            `> ?? **+1.00** ? ${await translateText('Major update with new systems or redesigns', lang)}`
          ].join('\n')
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in /version command:', err);
      try {
        const errorEmbed = await getUserEmbed(interaction.user.id, null, 'error');
        errorEmbed
          .setTitle('Unexpected Error')
          .setDescription(`\`\`\`${err.message}\`\`\``);
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (nestedErr) {
        console.error('Failed to send error embed:', nestedErr);
      }
    }
  }
};

