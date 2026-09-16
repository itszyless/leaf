// scrolltext.js
const { SlashCommandBuilder } = require('discord.js');

const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scrolltext')
        .setDescription('Scrolls text across the message.')
        .addStringOption(opt =>
            opt.setName('text')
               .setDescription('The text to scroll')
               .setRequired(true)
               .setMaxLength(25)),
        category: 'Animated',
  hidden: true,
    async execute(interaction) {
        let text = interaction.options.getString('text') + ' ';
        await interaction.editReply('‎');

        for (let i = 0; i < text.length + 20; i++) {
            let scroll = text.slice(i) + text.slice(0, i);
            await interaction.editReply(scroll);
            await new Promise(res => setTimeout(res, 150));
        }
    }
};

