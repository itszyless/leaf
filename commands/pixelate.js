const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const Jimp = require('jimp');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pixelate')
    .setDescription('Pixelates a user\'s avatar')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to pixelate').setRequired(false)),
  hidden: true,

  category: 'Image',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const user = interaction.options.getUser('user') || interaction.user;
    const url = user.displayAvatarURL({ extension: 'png', size: 256 });

    try {
      const img = await Jimp.read(url);
      img.pixelate(10);

      const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
      const file = new AttachmentBuilder(buffer, { name: 'pixelated.png' });

      const title = await translateText('Pixelated Avatar', lang);
      const desc = await translateText('Here is your pixelated image.', lang);

      const embed = (await getUserEmbed(interaction.user.id, 'Pixelate'))
        .setTitle(`👾 ${title}`)
        .setDescription(desc)
        .setImage('attachment://pixelated.png')

      await interaction.editReply({ embeds: [embed], files: [file] });

    } catch (err) {
      //console.error(err);
      const errorMsg = await translateText('Something went wrong while pixelating the avatar.', lang);

      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(errorMsg)

      await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
  }
};
