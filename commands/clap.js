const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');

const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clap')
    .setDescription('Adds 👏 between your words')
    .addStringOption(opt =>
      opt.setName('text')
         .setDescription('Text to clapify')
         .setRequired(true)
         .setMaxLength(200)
    ),
  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const input = interaction.options.getString('text');
    const clapped = input.trim().split(/\s+/).join(' 👏 ');
    const title = await translateText('Clapified Text', lang);

    const embed = (await getUserEmbed(interaction.user.id, 'Clap'))
      .setTitle(`👏 ${title}`)
      .setDescription('\`\`\`'+clapped+'\`\`\`')

    await interaction.editReply({ embeds: [embed] });
  }
};