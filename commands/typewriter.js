// typewriter.js
const { SlashCommandBuilder } = require('discord.js');

const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('typewriter')
        .setDescription('Simulates typing animation.')
        .addStringOption(opt =>
            opt.setName('text')
               .setDescription('The text to animate')
               .setRequired(true)
               .setMaxLength(25)),
        category: 'Animated',
  hidden: true,
    async execute(interaction) {
        const text = interaction.options.getString('text');
        await interaction.editReply('‎');

        let content = '';
        for (let i = 0; i < text.length; i++) {
            content += text[i];
            await interaction.editReply(content);
            await new Promise(res => setTimeout(res, 100));
        }
    }
};

