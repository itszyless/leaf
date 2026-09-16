const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText, getTranslated } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fact')
    .setDescription('Sends a random fact'),
  category: 'Misc',
  hidden: true,

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';
    const res = await fetch(`https://uselessfacts.jsph.pl/random.json?language=en`);
    const data = await res.json();

    const title = await translateText('Random Fact', userLang);
    const fact = await getTranslated(data.text, userLang);

    const embed = (await getUserEmbed(interaction.user.id, 'Fact'))
      .setTitle(`📚 ${title}`)
      .setDescription(fact)

    await interaction.editReply({ embeds: [embed] });
  }
};
