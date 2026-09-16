const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const path = require('path');
const fs = require('fs');
const { getUserEmbed } = require('../utils/getUserEmbed');

function generatePassword(length = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_-+=<>?';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('password')
    .setDescription('Generate a secure random password')
    .addIntegerOption(opt =>
      opt.setName('length')
        .setDescription('Password length (default: 12)')
        .setMinValue(4)
        .setMaxValue(64)
        .setRequired(false)
    ),
  category: 'Utility',
  hidden: true,

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const length = interaction.options.getInteger('length') || 12;

    const title = await translateText('?? Your Password', lang);
    const subtitle = await translateText('Here is your generated password:', lang);

    const password = generatePassword(length);

    const embed = (await getUserEmbed(interaction.user.id, 'Password'))
      .setTitle(title)
      .setDescription(`${subtitle}\n\`\`\`${password}\`\`\``)

    await interaction.editReply({ embeds: [embed] });
  }
};

