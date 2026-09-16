const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const Jimp = require('jimp');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blur')
    .setDescription('Blurs someone’s avatar by a percentage.')
    .addIntegerOption(opt =>
      opt
        .setName('percent')
        .setDescription('Blur intensity (1–100%)')
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('Whose avatar to blur')
        .setRequired(false)
    ),
  hidden: true,

  category: 'Image',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const percent = interaction.options.getInteger('percent');
    const targetUser = interaction.options.getUser('user') || interaction.user;

    // --- validation ---
    if (percent <= 0 || percent > 100) {
      const desc = await translateText('Please enter a value between 1 and 100.', lang);
      const embed = (await getUserEmbed(interaction.user.id, null, 'error')).setDescription(desc);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    try {
      // --- read + blur avatar ---
      const avatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 512 });
      const image = await Jimp.read(avatarUrl);
      const blurAmount = Math.max(1, Math.round(percent / 3));
      image.blur(blurAmount);

      const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
      const attachment = new AttachmentBuilder(buffer, { name: 'blurred.png' });

      // --- embed info ---
      const title = await translateText('Blurred Avatar', lang);
      const desc = await translateText('Blurred at', lang);

      const embed = await getUserEmbed(interaction.user.id, 'Blur');
      embed
        .setTitle(title)
        .setDescription(
          `${desc}: \`${percent}%\`\n> ${await translateText('User:', lang)} ${targetUser}`
        )
        .setImage('attachment://blurred.png');

      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (err) {
      console.error('Blur command error:', err);

      const msg = await translateText('Something went wrong while blurring the avatar.', lang);
      const embed = (await getUserEmbed(interaction.user.id, null, 'error')).setDescription(msg);

      await interaction.editReply({ embeds: [embed] });
    }
  }
};
