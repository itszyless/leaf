const {
  SlashCommandBuilder,
  AttachmentBuilder,
} = require('discord.js');

const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const Canvas = require('@napi-rs/canvas');
  const path = require('path');
const fs = require('fs');

/* ───────────────── helpers ───────────────── */

function getShipLabel(percent, selfLove) {
  if (selfLove) return 'You love yourself 🫶';
  if (percent >= 95) return '💍 Perfect Match';
  if (percent >= 85) return '❤️ Power Couple';
  if (percent >= 70) return '🔥 Strong Connection';
  if (percent >= 55) return '💞 It’s Getting Serious';
  if (percent >= 40) return '😅 Friendzone Energy';
  if (percent >= 25) return '💔 Situationship';
  if (percent >= 10) return '🚩 Red Flag Combo';
  return '☠️ Not Meant to Be';
}

// draw rounded rect path to reuse
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function generateShipCanvas(user1, user2, percent, label, selfLove) {
  const width = 900;
  const height = 300;
  const canvas = Canvas.createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  /* background card w/ gradient + glow border */
  // outer rounded card clip
  roundRectPath(ctx, 0, 0, width, height, 40);
  ctx.clip();

  // purple-black gradient bg
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#080011');
  bgGrad.addColorStop(0.3, '#160026');
  bgGrad.addColorStop(0.7, '#2a0047');
  bgGrad.addColorStop(1, '#080011');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // border glow ring
  ctx.save();
  ctx.shadowColor = '#ff6fae';
  ctx.shadowBlur = 30;
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#ff6fae';
  roundRectPath(ctx, 7, 7, width - 14, height - 14, 34);
  ctx.stroke();
  ctx.restore();

  // load avatars
  const [a1, a2] = await Promise.all([
    Canvas.loadImage(user1.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null),
    Canvas.loadImage(user2.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null),
  ]);

  function drawAvatar(img, cx, cy, r, glowColor) {
    // soft glow ring behind
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();

    // avatar circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (img) {
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // positions
  const avatarRadius = 75;
  const leftX = 150;
  const rightX = width - 150;
  const centerY = 140;

  drawAvatar(a1, leftX, centerY, avatarRadius, '#ff6fae');
  drawAvatar(a2, rightX, centerY, avatarRadius, '#ff6fae');

  // center heart (as text, with glow)
  ctx.save();
  ctx.font = '100px "Arial Black"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff6fae';
  ctx.shadowBlur = 35;
  ctx.fillStyle = '#ff6fae';
  ctx.fillText('<3', width / 2, centerY);
  ctx.restore();

  // % number under heart
  ctx.save();
  ctx.font = 'bold 40px "Arial Black"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#000000';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 20;
  ctx.strokeText(`${percent}%`, width / 2 + 15, 220);
  ctx.fillText(`${percent}%`, width / 2 + 15, 220);
  ctx.restore();

  // love bar bg
  const barW = 480;
  const barH = 24;
  const barX = (width - barW) / 2;
  const barY = 255;
  // how much of it is filled
  const fillWraw = (percent / 100) * barW;
  const fillW = percent > 0 ? Math.max(fillWraw, 10) : 0; // keep tiny sliver so 3% isn't invisible

  // bar background (dark)
  ctx.save();
  roundRectPath(ctx, barX, barY, barW, barH, 12);
  ctx.fillStyle = '#2a0022';
  ctx.fill();
  ctx.restore();

  // bar fill (pink gradient)
  if (fillW > 0) {
    const barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    barGrad.addColorStop(0, '#ff6fae');
    barGrad.addColorStop(1, '#ff2a6f');

    ctx.save();
    roundRectPath(ctx, barX, barY, fillW, barH, 12);
    ctx.fillStyle = barGrad;
    ctx.fill();
    ctx.restore();
  }

  // return attachment
  return new AttachmentBuilder(await canvas.encode('png'), { name: 'ship.png' });
}

/* ───────────────── command ───────────────── */

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Ship two users together and see how compatible they are.')
    .addUserOption(opt =>
      opt.setName('user1')
        .setDescription('First user')
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('user2')
        .setDescription('Second user (leave empty to ship with yourself)')
        .setRequired(false)
    ),
  hidden: true,

  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';

    // user1 is the argument
    const argUser1 = interaction.options.getUser('user1');
    // user2 is optional (defaults to whoever ran the command)
    const argUser2 = interaction.options.getUser('user2') || interaction.user;

    // per your request:
    // if no second user, make author = first, first argument is second in text:
    // That means display order visually like:
    // <invoker or "you"> on RIGHT, <target> on LEFT
    // BUT logic for self-love still works either way
    let userLeft = argUser1;      // first argument on left
    let userRight = argUser2;     // caller (or selected user2) on right

    // easter egg: if shipping same person
    const selfLove = (userLeft.id === userRight.id);

    // random % unless same user (self love = 100 always)
    const percent = selfLove
      ? 100
      : Math.floor(Math.random() * 101);

    const label = getShipLabel(percent, selfLove);

    try {
      const attachment = await generateShipCanvas(userLeft, userRight, percent, label, selfLove);
      const t1 = await translateText("Score:", lang);
      const t2 = await translateText("Result:", lang);
      const t3 = await translateText("Love yourself.", lang);

      const embed = await getUserEmbed(interaction.user.id, 'Ship');
      embed
        .setColor('#ff6fae')
        .setTitle('💘 Love Compatibility')
        .setDescription(
          [
            `**${userLeft.username}** ❤ **${userRight.username}**`,
            '',
            `**${t1}** ${percent}%`,
            `**${t2}** ${label}`,
            selfLove ? `\n> ${t3} :) 👑` : ''
          ].join('\n')
        )
        .setImage('attachment://ship.png');

      await interaction.editReply({
        embeds: [embed],
        files: [attachment]
      });
    } catch (err) {
      console.error('💔 /ship command error:', err);
      const errorEmbed = await getUserEmbed(interaction.user.id, null, 'error');
      errorEmbed.setDescription(await translateText('There was an error generating the ship image.', lang));
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};
