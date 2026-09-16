const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getAgentMode, setAgentMode } = require('../utils/agentMode');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('agent')
    .setDMPermission(true)
    .setDescription('Choose whether bot replies are ephemeral (Agent Mode)')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Choose reply visibility')
        .setRequired(true)
        .addChoices(
          { name: 'Enabled (ephemeral replies)', value: 'true' },
          { name: 'Disabled (public replies)', value: 'false' }
        )
    ),
  category: 'Settings',

  async execute(interaction) {
    const userId = interaction.user.id;
    const userLang = getUserLanguage(userId) || 'en';
    const mode = interaction.options.getString('mode');
    const enabled = mode === 'true';

    const current = getAgentMode(userId);

    if (current === enabled) {
      const statusText = enabled ? await translateText('enabled', userLang) : await translateText('disabled', userLang);
      const errorDesc = await translateText(`Agent mode is already \`${statusText}\`.`, userLang);

      const errorEmbed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(errorDesc)

      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    setAgentMode(userId, enabled);

    const successTitle = await translateText('Agent Mode Updated', userLang);
    const statusText = enabled ? await translateText('enabled', userLang) : await translateText('disabled', userLang);
    const successDesc = await translateText(`Agent mode is now \`${statusText}\`.`, userLang);

    const embed = (await getUserEmbed(interaction.user.id, 'Agent'))
      .setTitle(successTitle)
      .setDescription(successDesc)

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
