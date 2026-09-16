const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { quotes } = require('../data/quotes.json');

const path = require('path');
const fs = require('fs');
const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quote')
    .setDescription('Get a random motivational quote'),
  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const random = quotes[Math.floor(Math.random() * quotes.length)];

    const title = await translateText('💡 Quote of the Moment', lang);
    const byText = await translateText('— by', lang);

    const quoteTranslated = await translateText(random.quote, lang);
    const originTranslated = await translateText("Original:", lang);

    const embed = (await getUserEmbed(interaction.user.id, 'Quote'))
      .setTitle(title)
      .setDescription(`${quoteTranslated}\n-# (*${originTranslated} ${random.quote}*)\n\n${byText} **${random.author}**`)

    await interaction.editReply({ embeds: [embed] });
  }
};
