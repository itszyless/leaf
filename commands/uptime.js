const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Shows how long the bot has been online.'),
  category: 'Misc',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const ms = interaction.client.uptime;

    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms / (60 * 60 * 1000)) % 24);
    const minutes = Math.floor((ms / (60 * 1000)) % 60);
    const seconds = Math.floor((ms / 1000) % 60);

    const title = await translateText('Bot Uptime', lang);
    const desc = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    const embed = (await getUserEmbed(interaction.user.id, 'Uptime'))
      .setTitle(`⏱️ ${title}`)
      .setDescription(`\`${desc}\``)

    await interaction.editReply({ embeds: [embed] });
  }
};
