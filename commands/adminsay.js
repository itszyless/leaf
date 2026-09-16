const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminsay')
    .setDescription('Make the bot send a custom message or embed.')
    .addStringOption(opt =>
      opt
        .setName('type')
        .setDescription('Choose between normal message or embed.')
        .setRequired(true)
        .addChoices(
          { name: 'Normal', value: 'normal' },
          { name: 'Embed', value: 'embed' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('title')
        .setDescription('Optional embed title.')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('description')
        .setDescription('Optional embed description or message content.')
        .setRequired(false)
        .setMaxLength(2000)
    )
    .addStringOption(opt =>
      opt
        .setName('author')
        .setDescription('Optional author text (top-left of embed).')
        .setRequired(false)
    ),
  category: 'Admin',
  hidden: true,

  async execute(interaction) {
    

    try {

      const lang = (await getUserLanguage(interaction.user.id)) || 'en';
      const type = interaction.options.getString('type');
      const title = interaction.options.getString('title') || 'Admin Say';
      const description = (interaction.options.getString('description') || '').replace(/\\n/g, '\n');
      const authorText = interaction.options.getString('author') || 'Admin Message';

      if (type === 'embed') {
        const embed = await getUserEmbed(interaction.user.id, authorText);

        if (title) embed.setTitle(title);
        if (description) embed.setDescription(description);

        await interaction.editReply({ embeds: [embed] });
      } else {
        const messageContent = description || title;
        await interaction.editReply({ content: messageContent });
      }
    } catch (err) {
      console.error('❌ Error in /adminsay command:', err);
      try {
        const errorEmbed = await getUserEmbed(interaction.user.id, null, 'error');
        errorEmbed
          .setTitle('❌ Error')
          .setDescription(`\`\`\`${err.message}\`\`\``);
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch {
        await interaction.reply({
          content: '❌ Something went wrong while sending your message.',
          ephemeral: true
        });
      }
    }
  }
};
