const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reverse')
    .setDescription('Reverses the input text')
    .addStringOption(opt =>
      opt.setName('text')
         .setDescription('Text to reverse')
         .setRequired(true)
         .setMaxLength(200)),
  hidden: true,
  category: 'Misc',

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';
    const input = interaction.options.getString('text');
    const reversed = input.split('').reverse().join('');

    const title = await translateText('Reversed Text', userLang);
    const original = await translateText('Original', userLang);
    const result = await translateText('Reversed', userLang);

    const embed = (await getUserEmbed(interaction.user.id, 'Reverse'))
      .setTitle(`↩️ ${title}`)
      .addFields(
        { name: original, value: `\`${input}\`` },
        { name: result, value: `\`${reversed}\`` }
      )

    await interaction.editReply({ embeds: [embed] });
  }
};
