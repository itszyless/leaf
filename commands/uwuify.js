// uwuify.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

function uwuify(text) {
  return text
    .replace(/[lr]/g, 'w')
    .replace(/[LR]/g, 'W')
    .replace(/n([aeiou])/gi, 'ny$1')
    .replace(/ove/gi, 'uv')
    .replace(/!+/g, ' owo!')
    .replace(/\bthe\b/gi, 'da')
    .replace(/\bis\b/gi, 'ish')
    .replace(/\bhas\b/gi, 'haz')
    + ' ✨';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('uwuify')
    .setDescription('Transforms your message into cute uwu-speak')
    .addStringOption(opt =>
      opt.setName('text')
        .setDescription('Text to uwuify')
        .setRequired(true)
        .setMaxLength(200)
    ),
  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const text = interaction.options.getString('text');
    const uwuText = uwuify(text);

    const title = await translateText('Uwuified Text', lang);

    const embed = (await getUserEmbed(interaction.user.id, 'Uwuify'))
      .setTitle(`😳 ${title}`)
      .setDescription('\`\`\`'+uwuText+'\`\`\`')

    await interaction.editReply({ embeds: [embed] });
  }
};
