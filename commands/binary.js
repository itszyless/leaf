const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('binary')
    .setDescription('Converts text to binary with animation')
    .addStringOption(opt =>
      opt.setName('text')
         .setDescription('Text to convert')
         .setRequired(true)
         .setMaxLength(40)),
  category: 'Animated',
  hidden: true,

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const text = interaction.options.getString('text');

    let output = '';
    await interaction.editReply('‎');

    for (let i = 0; i < text.length; i++) {
      const binary = text[i].charCodeAt(0).toString(2).padStart(8, '0');
      output += `${binary} `;

      await interaction.editReply(`\`${output}\``);
      await new Promise(res => setTimeout(res, 180));
    }

    const title = await translateText('Binary Code Result', lang);
    const embed = (await getUserEmbed(interaction.user.id, 'Binary'))
      .setTitle(`💻 ${title}`)
      .setDescription(`\`\`\`\n${output.trim()}\n\`\`\``)

    await interaction.editReply({ embeds: [embed] });
  }
};

