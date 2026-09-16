const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const path = require('path');
const fs = require('fs');

const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('qr')
    .setDescription('Creates a QR code from a link or text')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Text or link to convert to a QR code')
        .setRequired(true)
    ),
  category: 'Utility',
  hidden: true,

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';
    const text = interaction.options.getString('text');

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(text)}&size=250x250`;
    const title = await translateText('QR Code Generator', userLang);
    const label = await translateText('Generated for', userLang);

    const embed = (await getUserEmbed(interaction.user.id, 'QR'))
      .setTitle(`?? ${title}`)
      .setDescription(`${label}: \`${text.slice(0, 256)}\``)
      .setImage(qrUrl)

    await interaction.editReply({ embeds: [embed] });
  }
};

