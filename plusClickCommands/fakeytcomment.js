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
      .setName('Fake YouTube Comment')
      .setType(ApplicationCommandType.Message),
    category: 'Plus',
  
    async execute(interaction) {
      const msg = interaction.targetMessage;
      const lang = getUserLanguage(interaction.user.id) || 'en';
  
      if (!msg || !msg.content || msg.content.length < 1 || msg.content.length > 40) {
        const desc = await translateText('The selected message must contain between 1 and 40 characters.', lang);
        const embed = await getUserEmbed(interaction.user.id, null, 'error');
        embed.setDescription(desc);
        return await interaction.editReply({ embeds: [embed], ephemeral: true });
      }

      const admins = loadJSON(path.join(__dirname, '../data/admins.json'));
      const plusUsers = loadJSON(path.join(__dirname, '../data/plusUsers.json'));
  
      const displayName = msg.member?.displayName || msg.author.username;
      const avatarURL = msg.author.displayAvatarURL({ extension: 'png', size: 256 });
      const avatar = await Canvas.loadImage(avatarURL);

      const ownerId = config.Owner_ID;
      const isOwner = msg.author.id === ownerId;
      const isAdmin = admins[msg.author.id] === true;
      const isPlus = plusUsers[msg.author.id] === true;
  
// === Estimate canvas height based on text ===
// 1. Measure text height
const measureCanvas = Canvas.createCanvas(1, 1);
const measureCtx = measureCanvas.getContext('2d');
measureCtx.font = '32px Arial';

const tweetWords = msg.content.split(' ');
const tweetMaxWidth = 940;
let tweetLine = '';
let tweetLines = 1;

for (const word of tweetWords) {
  const testLine = tweetLine + word + ' ';
  if (measureCtx.measureText(testLine).width > tweetMaxWidth) {
    tweetLines++;
    tweetLine = word + ' ';
  } else {
    tweetLine = testLine;
  }
}

// 2. Estimate drawing positions (manual layout)
const baseY = 190;
const lineHeight = 42;
const afterText = 40; // timestamp + stats + icons
const canvasHeight = baseY + tweetLines * lineHeight + afterText;

// 3. Use that to create the real canvas
let canvas = Canvas.createCanvas(1000, 2000); // Temporary large height
let ctx = canvas.getContext('2d');




    // Clip the entire canvas to a rounded rectangle
    const cornerRadius = 20;
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, cornerRadius);
    ctx.clip();

    // Now all subsequent drawing will be contained within the rounded corners

    // Full white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(80, 80, 40, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, 40, 40, 80, 80);
      ctx.restore();
  
      // Username
      ctx.fillStyle = '#0f0f0f';
      ctx.font = 'bold 36px Arial';
      ctx.fillText(displayName, 140, 70);

      let badgeX = ctx.measureText(displayName).width + 155;

      // Badges (Owner > Admin > Plus)
      if (isOwner) {
        const ownerBadge = await Canvas.loadImage(path.join(__dirname, '../assets/badges/Owner.png'));
        ctx.drawImage(ownerBadge, badgeX, 42, 32, 32);
        badgeX += 42;
      }
      if (isAdmin) {
        const adminBadge = await Canvas.loadImage(path.join(__dirname, '../assets/badges/Admin.png'));
        ctx.drawImage(adminBadge, badgeX, 42, 32, 32);
        badgeX += 42;
      }
      if (isPlus) {
        const plusBadge = await Canvas.loadImage(path.join(__dirname, '../assets/badges/Plus.png'));
        ctx.drawImage(plusBadge, badgeX, 42, 32, 32);
      }
  
      // Timestamp
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
      const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      ctx.fillStyle = '#606060';
      ctx.font = '26px Arial';
      const nameX = 140;
      const nameWidth = ctx.measureText(displayName).width;
      const badgeCount =
        (isOwner ? 1 : 0) +
        (isAdmin ? 1 : 0) +
        (isPlus ? 1 : 0);
      const badgeSpacing = 42; // each badge = 32 + ~10px gap
      const totalNameWidth = nameWidth + badgeCount * badgeSpacing;
      
      const timeText = `${timeStr} · ${dateStr}`;
      const timeWidth = ctx.measureText(timeText).width;
      const timestampX = 675;
      
      if (nameX + totalNameWidth + 150 > timestampX) {
        ctx.fillText(timeText, nameX, 105); // below username
      } else {
        ctx.fillText(timeText, timestampX, 70); // next to name
      }
        
  
      // Comment text
      ctx.fillStyle = '#0f0f0f';
      ctx.font = '33px Arial';
      const words = msg.content.split(' ');
      let line = '';
      let y = (nameX + totalNameWidth + 150 > timestampX) ? 150 : 115;
      const textStartX = 138;
      const textEndX = canvas.width - 40;
      const maxWidth = textEndX - textStartX;
      
      for (const word of words) {
          const testLine = line + word + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth) {
              // Handle long words that exceed the max width
              if (ctx.measureText(word).width > maxWidth) {
                  let subLine = '';
                  for (const char of word) {
                      const subTestLine = subLine + char;
                      if (ctx.measureText(subTestLine).width > maxWidth) {
                          ctx.fillText(subLine, textStartX, y);
                          subLine = char;
                          y += 35;
                      } else {
                          subLine = subTestLine;
                      }
                  }
                  ctx.fillText(subLine, textStartX, y);
                  line = ' '; // Start new line with a space
                  //y += 5;
              } else {
                  ctx.fillText(line, textStartX, y);
                  line = word + ' ';
                  //y += 5;
              }
          } else {
              line = testLine;
          }
      }
      ctx.fillText(line, textStartX, y);
      y += 60;
  
      // Load icons
      const likeIcon = await Canvas.loadImage(path.join(__dirname, '../assets/fake-youtube-comment/like.png'));
      const dislikeIcon = await Canvas.loadImage(path.join(__dirname, '../assets/fake-youtube-comment/dislike.png'));
  
      // Likes / Dislikes / Reply
      ctx.drawImage(likeIcon, 140, y - 40, 40, 40);
      ctx.drawImage(dislikeIcon, 255, y - 36, 40, 40);
  
      ctx.fillStyle = '#606060';
      ctx.font = '32px Arial';
      ctx.fillText('2k', 200, y - 8);
      ctx.fillText('REPLY', 340, y - 8);
  
      // Replies link
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 34px Arial';
      ctx.fillText('View 189 replies', 140, y + 50);

      y = y + 50 + 40; // Final Y + padding

      const finalCanvas = Canvas.createCanvas(1000, y);
      const finalCtx = finalCanvas.getContext('2d');
      
      // Clip with rounded corners again
      drawRoundedRect(finalCtx, 0, 0, finalCanvas.width, finalCanvas.height, 20);
      finalCtx.clip();
      
      // Redraw everything to new canvas
      finalCtx.drawImage(canvas, 0, 0);
      
        canvas = finalCanvas;
  
      const file = new AttachmentBuilder(await canvas.encode('png'), { name: 'youtube-comment.png' });
      await interaction.editReply({ files: [file] });
    }
  };