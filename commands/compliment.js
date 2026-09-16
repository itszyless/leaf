const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText, getTranslated } = require('../utils/translator');
const compliments = require('../data/compliments.json');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const path = require('path');
const fs = require('fs');

const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compliment')
    .setDescription('Receive a random wholesome compliment'),
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const compliment = compliments[Math.floor(Math.random() * compliments.length)];

    const title = await translateText('Compliment', lang);
    const translated = await getTranslated(compliment, lang);

    const embed = (await getUserEmbed(interaction.user.id, 'Compliment'))
      .setTitle(`💖 ${title}`)
      .setDescription(`**${translated}**`)

    interaction.editReply({ embeds: [embed] });
  }
};
