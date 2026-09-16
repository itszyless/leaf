const { SlashCommandBuilder } = require('discord.js');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hearttype')
    .setDescription('Types your message letter by letter with hearts')
    .addStringOption(opt =>
      opt.setName('text').setDescription('Text to type').setRequired(true).setMaxLength(40)),

  category: 'Animated',
  hidden: true,

  async execute(interaction) {
    const text = interaction.options.getString('text');
    await interaction.editReply('‎');
    let result = '';

    for (const char of text) {
      result += `${char}❤️`;
      await interaction.editReply(result);
      await new Promise(res => setTimeout(res, 75));
    }
  }
};

