const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const fs = require('fs');

const morseCodeMap = {
  'a': '.-',    'b': '-...',  'c': '-.-.',  'd': '-..',   'e': '.',
  'f': '..-.',  'g': '--.',   'h': '....',  'i': '..',    'j': '.---',
  'k': '-.-',   'l': '.-..',  'm': '--',    'n': '-.',    'o': '---',
  'p': '.--.',  'q': '--.-',  'r': '.-.',   's': '...',   't': '-',
  'u': '..-',   'v': '...-',  'w': '.--',   'x': '-..-',  'y': '-.--',
  'z': '--..',  '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '0': '-----', ' ': ' / '
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('morse')
    .setDescription('Converts text to Morse code with animation')
    .addStringOption(opt =>
      opt.setName('text')
         .setDescription('Text to convert')
         .setRequired(true)
         .setMaxLength(50)),
  category: 'Animated',
  hidden: true,

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const text = interaction.options.getString('text').toLowerCase();

    let output = '';
    await interaction.editReply('‎');

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const morse = morseCodeMap[char] || '?';
      output += `${morse} `;

      await interaction.editReply(`\`${output}\``);
      await new Promise(res => setTimeout(res, 180));
    }

    const title = await translateText('Morse Code Result', lang);
    const embed = (await getUserEmbed(interaction.user.id, 'Morse'))
      .setTitle(`📡 ${title}`)
      .setDescription(`\`\`\`\n${output.trim()}\n\`\`\``)

    await interaction.editReply({ embeds: [embed] });
  }
};
