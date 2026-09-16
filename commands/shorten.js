const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shorten')
    .setDescription('Shortens a URL')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('The URL to shorten')
        .setRequired(true)
    ),
  category: 'Utility',

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';
    const url = interaction.options.getString('url');

    let isValidUrl = true;
    try {
      new URL(url);
    } catch {
      isValidUrl = false;
    }

    if (!isValidUrl) {
      const message = await translateText('The input is not a valid URL.', userLang);

      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(message)

      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    try {
      const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
      const short = await res.text();

      if (short.toLowerCase().startsWith('error')) {
        throw new Error(short);
      }

      const title = await translateText('Shortened URL', userLang);
      const shortenURL1 = await translateText('Shorten URL:', userLang)

      const embed = (await getUserEmbed(interaction.user.id, 'Shorten'))
        .setTitle(`?? ${title}`)
        .setDescription(`${shortenURL1} ${short}\n${await translateText('Original', userLang)}: ${url}`)

      interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      const message = await translateText('Could not shorten the URL.', userLang);

      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(message)

      interaction.editReply({ embeds: [embed] });
    }
  }
};

