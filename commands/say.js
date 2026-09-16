const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Send as normal message or embed')
        .setRequired(true)
        .addChoices(
          { name: 'Normal', value: 'normal' },
          { name: 'Embed', value: 'embed' }
        )
    )
    .addStringOption(opt =>
      opt.setName('text')
         .setDescription('Text to say')
         .setRequired(true)
         .setMaxLength(300)
    ),
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const type = interaction.options.getString('type');
    const text = interaction.options.getString('text');

    if (type === 'embed') {
      const title = await translateText('Say Command', lang);
      const embed = (await getUserEmbed(interaction.user.id, 'Say (Embeded)'))
        .setTitle(`🗣️ ${title}`)
        .setDescription(text)

      return await interaction.editReply({ embeds: [embed] });
    } else {
      return await interaction.editReply({ content: text });
    }
  }
};
