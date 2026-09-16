const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dog')
    .setDescription('Sends a random dog image'),
  category: 'Image',
  hidden: true,

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';
    const title = await translateText('Random Dog', userLang);

    const res = await fetch('https://dog.ceo/api/breeds/image/random');
    const data = await res.json();
    const image = data.message;

    const embed = (await getUserEmbed(interaction.user.id, 'Dog'))
      .setTitle(`🐶 ${title}`)
      .setImage(image)

    await interaction.editReply({ embeds: [embed] });
  }
};
