const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { translateText } = require('../utils/translator');
const { getUserLanguage } = require('../utils/langStorage');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

function glitchFrame(text) {
  const glitchChars = '#@%*!?/\\|[]{}<>~+-=_';
  return text
    .split('')
    .map(char => (Math.random() < 0.25 ? glitchChars[Math.floor(Math.random() * glitchChars.length)] : char))
    .join('');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('glitchtext')
    .setDescription('Animate your message with a glitch effect')
    .addStringOption(opt =>
      opt.setName('text')
        .setDescription('Text to glitch')
        .setRequired(true)
        .setMaxLength(50)
    ),
  category: 'Animated',
  hidden: true,

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const input = interaction.options.getString('text');

    const message = await interaction.editReply({ content: glitchFrame(input) });

    let frame = 0;
    const interval = setInterval(async () => {
      frame++;
      let newContent = glitchFrame(input);
      try {
        await message.edit({ content: newContent });
      } catch (e) {
        clearInterval(interval);
      }
      if (frame > 10) clearInterval(interval);
    }, 350);
  }
};


