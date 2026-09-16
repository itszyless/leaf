// commands/howgay.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { translateText } = require('../utils/translator');
const { getUserLanguage } = require('../utils/langStorage');
const path = require('path');
const fs = require('fs');

const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('howgay')
    .setDescription('Shows how gay someone is')
    .addUserOption(opt =>
      opt.setName('user')
         .setDescription('User to test')
         .setRequired(false)
    ),
  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const target = interaction.options.getUser('user') || interaction.user;
    const percent = Math.floor(Math.random() * 101);

    const title = await translateText('Gay Percentage Result', lang);
    const label = await translateText('is', lang);
    const percentLabel = await translateText('gay', lang);

    const embed = (await getUserEmbed(interaction.user.id, 'How-Gay'))
      .setTitle(`🌈 ${title}`)
      .setDescription(`**${target.username}** ${label} \`${percent}%\` ${percentLabel}!`)

    await interaction.editReply({ embeds: [embed] });
  }
};
