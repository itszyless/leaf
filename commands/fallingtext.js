const { SlashCommandBuilder } = require('discord.js');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fallingtext')
    .setDescription('Simulate falling text animation')
    .addStringOption(opt =>
      opt.setName('text')
        .setDescription('Text to animate')
        .setRequired(true)
        .setMaxLength(50)
    )
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('Falling direction')
        .addChoices(
          { name: 'Normal', value: 'normal' },
          { name: 'Reversed', value: 'reversed' }
        )
        .setRequired(false)
    ),
  category: 'Animated',
  hidden: true,

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const input = interaction.options.getString('text');
    const mode = interaction.options.getString('mode') || 'normal';

    const chars = [...input];
    const frames = [];

    if (mode === 'reversed') {
      for (let i = chars.length; i > 0; i--) {
        const part = chars.slice(i - 1).join('');
        frames.push(part);
      }
    } else {
      for (let i = 1; i <= chars.length; i++) {
        const part = chars.slice(0, i).join('');
        frames.push(part);
      }
    }

    const verticalFrames = frames.map((_, i) => frames.slice(0, i + 1).join('\n'));
    await interaction.editReply({ content: verticalFrames[0] });

    let current = 1;
    const interval = setInterval(() => {
      if (current >= verticalFrames.length) return clearInterval(interval);
      interaction.editReply({ content: verticalFrames[current++] }).catch(() => clearInterval(interval));
    }, 300);    
  }
};

