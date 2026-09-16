const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('explode')
    .setDescription('Makes your text explode letter by letter')
    .addStringOption(opt =>
      opt.setName('text')
         .setDescription('Text to explode')
         .setRequired(true)
         .setMaxLength(25)),
  category: 'Animated',
  hidden: true,

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const text = interaction.options.getString('text');

    await interaction.editReply(text);
    let exploded = text.split('');

    for (let i = 0; i < exploded.length; i++) {
      exploded[i] = '💥';
      await interaction.editReply(exploded.join(''));
      await new Promise(res => setTimeout(res, 150));
    }
  }
};

