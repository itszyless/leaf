const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');

const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar-compare')
    .setDescription('Compares two avatars side by side in a stylish layout')
    .addUserOption(opt =>
      opt.setName('user1').setDescription('First user').setRequired(true))
    .addUserOption(opt =>
      opt.setName('user2').setDescription('Second user').setRequired(true)),
  category: 'Image',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const user1 = interaction.options.getUser('user1');
    const user2 = interaction.options.getUser('user2');

    const url1 = user1.displayAvatarURL({ extension: 'png', size: 512 });
    const url2 = user2.displayAvatarURL({ extension: 'png', size: 512 });

    try {
      const img1 = await loadImage(url1);
      const img2 = await loadImage(url2);

      // create canvas
      const width = 800;
      const height = 400;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // gradient background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#1e1e2f');
      grad.addColorStop(1, '#2b2b3c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // helper: draw rounded image
      const drawRoundedImage = (image, x, y, size) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(image, x, y, size, size);
        ctx.restore();
      };

      // avatars
      const avatarSize = 250;
      const margin = 75;
      drawRoundedImage(img1, margin, height / 2 - avatarSize / 2, avatarSize);
      drawRoundedImage(img2, width - avatarSize - margin, height / 2 - avatarSize / 2, avatarSize);

      // usernames
      ctx.font = '28px Sans';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(user1.username, margin + avatarSize / 2, height / 2 + avatarSize / 2 + 40);
      ctx.fillText(user2.username, width - avatarSize / 2 - margin, height / 2 + avatarSize / 2 + 40);

      // divider line
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(width / 2, 60);
      ctx.lineTo(width / 2, height - 60);
      ctx.stroke();

      // "VS" text in the middle
      ctx.font = 'bold 60px Sans';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('VS', width / 2, height / 2 + 20);

      // subtle glow around avatars
      const glow = ctx.createRadialGradient(width / 4, height / 2, 10, width / 4, height / 2, 180);
      glow.addColorStop(0, 'rgba(255,255,255,0.1)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width / 2, height);

      const glow2 = ctx.createRadialGradient(width * 0.75, height / 2, 10, width * 0.75, height / 2, 180);
      glow2.addColorStop(0, 'rgba(255,255,255,0.1)');
      glow2.addColorStop(1, 'transparent');
      ctx.fillStyle = glow2;
      ctx.fillRect(width / 2, 0, width / 2, height);

      // output
      const buffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(buffer, { name: 'avatar-compare.png' });

      // translated texts
      const title = await translateText('Avatar Comparison', lang);
      const desc = await translateText('Who wears their avatar better?', lang);

      const embed = (await getUserEmbed(interaction.user.id, 'Avatar Compare'))
        .setTitle(`🆚 ${title}`)
        .setDescription(desc)
        .setImage('attachment://avatar-compare.png');

      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (err) {
      console.error('Avatar compare error:', err);
      const e = await getUserEmbed(interaction.user.id, null, 'error');
      e.setDescription(await translateText('Something went wrong while generating the comparison.', lang));
      await interaction.editReply({ embeds: [e], ephemeral: true });
    }
  },
};
