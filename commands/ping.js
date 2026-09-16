// ping.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { translateText } = require('../utils/translator');
const { getUserLanguage } = require('../utils/langStorage');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot\'s ping.'),
  category: 'Misc',

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';

    const sent = await interaction.editReply('🏓 Pinging...');
    const ping = sent.createdTimestamp - interaction.createdTimestamp;
    const t1 = await translateText('Bot Latency', userLang);
    const t2 = await translateText('API Latency', userLang);

    const embed = (await getUserEmbed(interaction.user.id, 'Ping'))
      .setTitle('🏓 Pong!')
      .setDescription(`${t1}: \`${ping}ms\`\n${t2}: \`${interaction.client.ws.ping}ms\``)

      await interaction.editReply({ content: '', embeds: [embed] });
  }
};
