const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flips a coin'),
  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';

    const title = await translateText('Coin Flip', userLang);
    const isHeads = Math.random() < 0.5;
    const result = {
        en: isHeads ? 'Heads' : 'Tails',
        de: isHeads ? 'Kopf' : 'Zahl',
        fr: isHeads ? 'Face' : 'Pile',
        es: isHeads ? 'Cara' : 'Cruz'
      }[userLang] || (isHeads ? 'Heads' : 'Tails');

    const embed = (await getUserEmbed(interaction.user.id, 'Coinflip'))
      .setTitle(`🪙 ${title}`)
      .setDescription(`**${result}**`)

    await interaction.editReply({ embeds: [embed] });
  }
};
