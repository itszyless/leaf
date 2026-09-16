const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const config = require('../config.json');
const { translateText } = require('../utils/translator');
const { getUserLanguage } = require('../utils/langStorage');
const path = require('path');
const fs = require('fs');

const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Get a random safe meme from Reddit')
    .setDMPermission(true),
  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';

    try {
      const res = await fetch('https://meme-api.com/gimme');
      const data = await res.json();

      if (data.nsfw) {
        const descriptionTranslated = await translateText(
          'A NSFW meme was fetched and has been filtered out. Please try again.',
          userLang
        );
        const descriptionOriginal = 'A NSFW meme was fetched and has been filtered out. Please try again.';

        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(`${descriptionTranslated}\n\n*${descriptionOriginal}*`)

        return await interaction.ephemeralReply({ embeds: [embed] });
      }

      const title = await translateText('Random Meme', userLang);
      const descriptionTranslated = data.title
        ? await translateText(data.title, userLang)
        : await translateText('No description available', userLang);
      const descriptionOriginal = data.title || 'No description available';

      const embed = (await getUserEmbed(interaction.user.id, 'Meme'))
        .setTitle(title)
        .setDescription(`${descriptionTranslated}\n\n*${descriptionOriginal}*`)
        .setURL(data.postLink)
        .setImage(data.url)

      await interaction.ephemeralReply({ embeds: [embed] });
    } catch (err) {
      console.error('Meme fetch error:', err);

      const descriptionTranslated = await translateText('Failed to fetch a meme. Please try again later.', userLang);
      const descriptionOriginal = 'Failed to fetch a meme. Please try again later.';

      const errorEmbed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(`${descriptionTranslated}\n\n*${descriptionOriginal}*`)

      await interaction.ephemeralReply({ embeds: [errorEmbed] });
    }
  },
};
