const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shutdown')
    .setDescription('Stops the bot (owner only)'),
  category: 'Admin',
  hidden: true,

  async execute(interaction) {
    const admins = loadJSON(path.join(__dirname, '../data/admins.json'));
    const userId = interaction.user.id;
    const lang = getUserLanguage(userId) || 'en';

    if (userId !== config.Owner_ID) {
      const denied = await translateText('You are not allowed to use this command.', lang);
      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(denied)

      return await interaction.editReply({ embeds: [embed] });
    }

    const restarting = await translateText('Stopping the bot...', lang);
    const embed = (await getUserEmbed(interaction.user.id, 'Shutdown'))
      .setTitle('🤖 Shutdown')
      .setDescription(restarting)

    await interaction.editReply({ embeds: [embed] });

    setTimeout(() => process.exit(0), 1500); // exit with code 0 (graceful)
  }
};
