const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const Canvas = require('@napi-rs/canvas');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

const TEMPLATE = 'https://claystage.com/wp-content/uploads/one-piece-wanted-poster-template-a3-300dpi.png';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wanted')
    .setDescription('Create a One Piece style wanted poster for a user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to make wanted')
        .setRequired(false)
    )
    .setDMPermission(true),

  category: 'Image',
  hidden: true,

  async execute(interaction) {
    try {
      const lang = getUserLanguage(interaction.user.id) || 'en';
      const user = interaction.options.getUser('user') || interaction.user;
      const avatarURL = user.displayAvatarURL({ extension: 'png', size: 512 });

      // Load both images
      const [poster, avatar] = await Promise.all([
        Canvas.loadImage(TEMPLATE),
        Canvas.loadImage(avatarURL)
      ]);

      const width = 768;
      const height = 1086;
      const canvas = Canvas.createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Draw poster
      ctx.drawImage(poster, 0, 0, width, height);

      // Avatar position (perfectly fits black frame area)
      const imgX = 160;
      const imgY = 228;
      const imgW = 457;
      const imgH = 460;

      const _imgX = 50;
      const _imgY = 220;
      const _imgW = 657;
      const _imgH = 475;

      ctx.drawImage(avatar, _imgX, _imgY, _imgW, _imgH);
      ctx.filter = 'blur(3px)'; // adjust value (1–5px usually)
      ctx.drawImage(avatar, _imgX, _imgY, _imgW, _imgH);
      ctx.filter = 'none';

      ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(40, 30, 20, 0.45)'; // dark brown tint
    ctx.fillRect(_imgX, _imgY, _imgW, _imgH);
    ctx.globalCompositeOperation = 'source-over';


      ctx.drawImage(avatar, imgX, imgY, imgW, imgH);

      // Add name below DEAD OR ALIVE
      ctx.font = 'bold 140px Times New Roman';
      ctx.fillStyle = '#3b2b17';
      ctx.textAlign = 'center';
      ctx.fillText(user.username.toUpperCase(), width / 2, 875);

      // Random bounty
      const bounty = Math.floor((Math.random() * 30 + 10) * 1_000_000); // 10–40 mil
      const bountyText = `${bounty.toLocaleString('en-US')}-`;

      ctx.font = 'bold 96px Times New Roman';
      ctx.fillText(bountyText, width / 2, 975);

      // Export
      const buffer = await canvas.encode('png');
      const file = new AttachmentBuilder(buffer, { name: 'wanted.png' });

      const title = await translateText('Wanted Poster', lang);
      const embed = await getUserEmbed(interaction.user.id, 'Wanted');
      embed
        .setTitle(title)
        .setDescription('Dead or Alive')
        .setImage('attachment://wanted.png');

      await interaction.editReply({ embeds: [embed], files: [file] });
    } catch (err) {
      console.error('Wanted command error:', err);
      const e = await getUserEmbed(interaction.user.id, null, 'error');
      e.setDescription('⚠️ Something went wrong while creating the wanted poster.');
      return interaction.editReply({ embeds: [e], ephemeral: true });
    }
  }
};
