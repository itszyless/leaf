const { SlashCommandBuilder } = require('discord.js');

const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wave')
        .setDescription('Animates text with wave effect.')
        .addStringOption(opt =>
            opt.setName('text')
               .setDescription('Text to animate')
               .setRequired(true)
               .setMaxLength(30)),
    category: 'Animated',
  hidden: true,

    async execute(interaction) {
        const text = interaction.options.getString('text');
        await interaction.editReply('‎');

        const waveSize = 2;
        const delay = 75;

        for (let i = 0; i < text.length + waveSize; i++) {
            let animated = text.split('').map((char, j) => {
                if (j === i || j === i - 1) return char.toUpperCase();
                return char.toLowerCase();
            }).join('');

            await interaction.editReply(animated);
            await new Promise(res => setTimeout(res, delay));
        }
    }
};

