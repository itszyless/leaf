const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rate')
    .setDescription('Rates your input from 0% to 100%')
    .addStringOption(opt =>
      opt.setName('thing')
         .setDescription('What should I rate?')
         .setRequired(true)
         .setMaxLength(50)),
  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const thing = interaction.options.getString('thing');
    const percent = Math.floor(Math.random() * 101);
    const title = await translateText('Rating Result', lang);
    const field = await translateText('Score', lang);

    const embed = (await getUserEmbed(interaction.user.id, 'Rate'))
      .setTitle(`📊 ${title}`)
      .setDescription(`> ${thing}\n${field}: \`${percent}%\`` )

    interaction.editReply({ embeds: [embed] });
  }
};
