const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  AttachmentBuilder
} = require('discord.js');
const Canvas = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const config = require('../config.json');

function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to load ${filePath}:`, err);
    return {};
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Fake Tweet')
    .setType(ApplicationCommandType.Message),
  category: 'Plus',

  async execute(interaction) {
    const msg = interaction.targetMessage;
    const lang = getUserLanguage(interaction.user.id) || 'en';

    if (!msg || !msg.content || msg.content.length < 1 || msg.content.length > 100) {
      const desc = await translateText('The selected message must contain between 1 and 100 characters.', lang);
      const embed = await getUserEmbed(interaction.user, null, 'error');
      embed.setDescription(desc);
      return await interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    const admins = loadJSON(path.join(__dirname, '../data/admins.json'));
    const plusUsers = loadJSON(path.join(__dirname, '../data/plusUsers.json'));

    const username = msg.author.username;
    const displayName = msg.member?.displayName || username;
    const avatarURL = msg.author.displayAvatarURL({ extension: 'png', size: 128 });
    const avatar = await Canvas.loadImage(avatarURL);

    const isOwner = msg.author.id === config.Owner_ID;
    const isAdmin = admins[msg.author.id] === true;
    const isPlus = plusUsers[msg.author.id] === true;

    // Temp canvas just to measure
    const tempCanvas = Canvas.createCanvas(1000, 3000);
    const ctx = tempCanvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(90, 90, 60, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 30, 30, 120, 120);
    ctx.restore();

    // Display name
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 30px Arial';
    ctx.fillText(displayName, 170, 80);
    let badgeX = ctx.measureText(displayName).width + 180;

    if (isOwner) {
      const img = await Canvas.loadImage(path.join(__dirname, '../assets/badges/Owner.png'));
      ctx.drawImage(img, badgeX, 48, 32, 32);
      badgeX += 38;
    }
    if (isAdmin) {
      const img = await Canvas.loadImage(path.join(__dirname, '../assets/badges/Admin.png'));
      ctx.drawImage(img, badgeX, 48, 32, 32);
      badgeX += 38;
    }
    if (isPlus) {
      const img = await Canvas.loadImage(path.join(__dirname, '../assets/badges/Plus.png'));
      ctx.drawImage(img, badgeX, 48, 32, 32);
    }

    // @username
    ctx.fillStyle = '#657786';
    ctx.font = '26px Arial';
    ctx.fillText(`@${username}`, 165, 110);

    // Tweet text
    ctx.fillStyle = '#000000';
    ctx.font = '32px Arial';
    const words = msg.content.split(' ');
    let line = '';
    let y = 190;
    const x = 30;
    const maxWidth = 940;

    for (const word of words) {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth) {
        if (ctx.measureText(word).width > maxWidth) {
          let subLine = '';
          for (const char of word) {
            const testSub = subLine + char;
            if (ctx.measureText(testSub).width > maxWidth) {
              ctx.fillText(subLine, x, y);
              subLine = char;
              y += 42;
            } else {
              subLine = testSub;
            }
          }
          ctx.fillText(subLine, x, y);
          line = ' ';
        } else {
          ctx.fillText(line, x, y);
          line = word + ' ';
          y += 42;
        }
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
    y += 40;

    // Timestamp
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const source = 'X for iPhone';

    ctx.fillStyle = '#657786';
    ctx.font = '24px Arial';
    ctx.fillText(`${timeStr} · ${dateStr} ·`, 30, y);
    const tsWidth = ctx.measureText(`${timeStr} · ${dateStr} · `).width;
    ctx.fillStyle = '#1da1f2';
    ctx.fillText(source, 30 + tsWidth, y);
    y += 30;

    // Line above stats
    ctx.strokeStyle = '#e1e8ed';
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(980, y);
    ctx.stroke();
    y += 35;

    // Stats
    ctx.font = 'bold 26px Arial';
    ctx.fillStyle = '#000000';
    ctx.fillText('32K', 30, y);
    ctx.fillText('12.7K', 240, y);

    ctx.font = '26px Arial';
    ctx.fillStyle = '#657786';
    ctx.fillText('Retweets', 105, y);
    ctx.fillText('Likes', 330, y);
    y += 30;

    // Line below stats
    ctx.strokeStyle = '#e1e8ed';
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(980, y);
    ctx.stroke();
    y += 25;

    // Icons
    try {
      const comment = await Canvas.loadImage(path.join(__dirname, '../assets/fake-tweet/comment.png'));
      const rt = await Canvas.loadImage(path.join(__dirname, '../assets/fake-tweet/retweet.png'));
      const like = await Canvas.loadImage(path.join(__dirname, '../assets/fake-tweet/heart.png'));
      ctx.drawImage(comment, 30, y - 20, 48, 48);
      ctx.drawImage(rt, 140, y - 20, 48, 48);
      ctx.drawImage(like, 250, y - 20, 48, 48);
    } catch {}

    y += 48;

    // Final canvas with correct height
    const finalHeight = y; //+ 190;
    const finalCanvas = Canvas.createCanvas(1000, finalHeight);
    const finalCtx = finalCanvas.getContext('2d');
    
    // Clip with rounded corners
    drawRoundedRect(finalCtx, 0, 0, finalCanvas.width, finalCanvas.height, 20);
    finalCtx.clip();
    
    // Draw the image
    finalCtx.drawImage(tempCanvas, 0, 0);
    

    const file = new AttachmentBuilder(await finalCanvas.encode('png'), { name: 'xpost.png' });
    await interaction.editReply({ files: [file] });
  }
};