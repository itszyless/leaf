
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} = require('discord.js');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const Canvas = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { getUserEmbed } = require('../utils/getUserEmbed');

const cooldownPath = path.join(__dirname, '../data/auraCooldowns.json');
const plusPath = path.join(__dirname, '../data/plusUsers.json');
const auraDataPath = path.join(__dirname, '../data/userAuras.json');
const adminsPath = path.join(__dirname, '../data/admins.json');


function isAdminUser(userId) {
  const admins = loadJSON(adminsPath);
  return admins[String(userId)] === true;
}

function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}


function formatNumber(num) {
  return num.toLocaleString('en-US');
}

function getAuraRank(amount) {
  if (amount >= 900_000_000_000) return 'ACTUALLY HIM';
  if (amount >= 200_000_000_000) return 'Built Different';
  if (amount >= 50_000_000_000) return 'Final Boss Energy';
  if (amount >= 10_000_000_000) return 'Top 0.1% Aura';
  if (amount >= 1_000_000_000) return 'Main Character';
  if (amount >= 100_000_000) return 'Protagonist Vibes';
  if (amount >= 10_000_000) return 'Mentally Unstable but Powerful';
  if (amount >= 1_000_000) return 'Certified Menace';
  if (amount >= 0) return 'Decent Human Being';
  if (amount >= -1_000_000) return 'Problematic';
  if (amount >= -10_000_000) return 'Villain Arc';
  return 'Walking Red Flag';
}

function weightedPick(weights) {
  // weights = [ [min,max,weight], ...]
  const total = weights.reduce((a, [, , w]) => a + w, 0);
  let roll = Math.random() * total;
  for (const [min, max, w] of weights) {
    if (roll < w) {
      // pick uniform in that range
      const span = max - min;
      return Math.floor(min + Math.random() * (span + 1));
    }
    roll -= w;
  }
  // fallback
  return 0;
}

function rollAura(isPlus) {
  if (isPlus) {
    return weightedPick([
      [50_000_000, 300_000_000, 20],   // strong
      [5_000_000, 50_000_000, 40],     // mid-high
      [100_000, 5_000_000, 30],        // normal
      [-1_000_000, 100_000, 8],        // meh
      [-5_000_000, -1_000_000, 2]      // bad luck
    ]);
  } else {
    return weightedPick([
      [5_000_000, 50_000_000, 10],     // lucky high
      [100_000, 5_000_000, 45],        // normal
      [-500_000, 100_000, 35],         // low
      [-5_000_000, -500_000, 10]       // very bad
    ]);
  }
}


async function generateAuraCanvas(user, avatarURL, auraAmount, rankName) {
  const width = 900;
  const height = 300;
  const canvas = Canvas.createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // helper for rounded rect
  const roundRect = (ctx, x, y, w, h, r) => {
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
  };

  // bg gradient (deep purple -> black -> purple)
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#050506');
  gradient.addColorStop(0.35, '#1a1b1e');
  gradient.addColorStop(0.75, '#2a2b2f');
  gradient.addColorStop(1, '#080809');

  roundRect(ctx, 0, 0, width, height, 40);
  ctx.fillStyle = gradient;
  ctx.fill();

  // border glow ring
  ctx.save();
  ctx.shadowColor = '#9ca3af';
  ctx.shadowBlur = 32;
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#4b5563';
  roundRect(ctx, 6, 6, width - 12, height - 12, 34);
  ctx.stroke();
  ctx.restore();

  // avatar
  const avatar = await Canvas.loadImage(avatarURL);
  const avatarSize = 170;
  const avatarCenterY = height / 2;
  const avatarLeft = 110; // moved a little more left

  ctx.save();
  ctx.beginPath();
  ctx.arc(
    avatarLeft + avatarSize / 2,
    avatarCenterY,
    avatarSize / 2,
    0,
    Math.PI * 2
  );
  ctx.closePath();
  ctx.shadowColor = '#6b7280';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.clip();
  ctx.drawImage(
    avatar,
    avatarLeft,
    avatarCenterY - avatarSize / 2,
    avatarSize,
    avatarSize
  );
  ctx.restore();

  // text block
  const textX = 300; // < moved left from 340 so big numbers fit nicely
  const nameY = 95;
  const auraY = 170;
  const rankY = 220;

  const auraFormatted = formatNumber(auraAmount);

  // username
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = 'bold 32px "Arial Black"';
  ctx.fillText(user.username, textX, nameY);

  // aura number (glow)
  ctx.font = 'bold 58px "Arial Black"';
  ctx.shadowColor = '#9ca3af';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(auraFormatted, textX, auraY);
  ctx.shadowBlur = 0;

  // rank / label
  ctx.font = 'bold 26px "Arial Black"';
  ctx.fillStyle = '#b8bcc4';
  ctx.fillText(rankName, textX, rankY);

  // subtle bottom glow strip
  const barGradient = ctx.createLinearGradient(0, height - 10, width, height);
  barGradient.addColorStop(0, 'rgba(156,163,175,0)');
  barGradient.addColorStop(0.5, 'rgba(156, 163, 175, 0.55)');
  barGradient.addColorStop(1, 'rgba(156,163,175,0)');
  ctx.fillStyle = barGradient;
  ctx.fillRect(0, height - 12, width, 12);

  return new AttachmentBuilder(await canvas.encode('png'), {
    name: 'aura.png'
  });
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('aura')
    .setDescription('Reveal your aura power (and reroll if allowed)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Target user').setRequired(false)
    ),
  hidden: true,

  category: 'Fun',

  async execute(interaction) {
    const viewer = interaction.user; // the one typing the command
    const targetUser = interaction.options.getUser('user') || viewer;

    const lang = getUserLanguage(viewer.id) || 'en';
    const cooldowns = loadJSON(cooldownPath);
    const plus = loadJSON(plusPath);
    const auraDB = loadJSON(auraDataPath);

    const now = Date.now();
    const targetId = targetUser.id;

    const isSelf = viewer.id === targetId;
    const isPlus = plus[targetId] === true;

    // cooldown rule:
    // plus: 15m
    // normal: 45m
    // exempt override list: basically devs get 5s
    const exempt = isAdminUser(targetId);
    const cooldownMs = exempt
      ? 5 * 1000
      : isPlus
      ? 15 * 60 * 1000
      : 45 * 60 * 1000;

    // ensure aura exists (first roll if not)
    if (auraDB[targetId] === undefined) {
      auraDB[targetId] = rollAura(isPlus);
      cooldowns[targetId] = { time: now };
      saveJSON(auraDataPath, auraDB);
      saveJSON(cooldownPath, cooldowns);
    }

    // helper: build + send/refresh full view
    const sendAuraView = async ({ interactionLike, isRerollInteraction }) => {
      // refresh data
      const auraVal = auraDB[targetId];
      const lastUsed = cooldowns[targetId]?.time || 0;
      const timePassed = now - lastUsed;
      const canReroll = isSelf && timePassed >= cooldownMs;
      const nextReadyUnix = Math.floor((lastUsed + cooldownMs) / 1000);

      // visual rank + canvas card
      const rankName = getAuraRank(auraVal);
      const attachment = await generateAuraCanvas(
        targetUser,
        targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
        auraVal,
        rankName
      );

      const t1 = await translateText("Card", lang);
      const t2 = await translateText("Power:", lang);
      const t3 = await translateText("Rank:", lang);
      const t4 = await translateText("You can reroll now.", lang);
      const t5 = await translateText("Reroll cooldown ends", lang);

      // embed (purple accent)
      const mainEmbed = await getUserEmbed(viewer.id, 'Aura');
      mainEmbed.setTitle(`${targetUser.username}'s Aura ${t1}`);
      mainEmbed.setDescription(
        [
          `**${t2}** ${formatNumber(auraVal)}`,
          `**${t3}** ${rankName}`,
          canReroll
            ? `\n${t4}`
            : isSelf
            ? `\n${t5} <t:${nextReadyUnix}:R>.`
            : ''
        ]
          .filter(Boolean)
          .join('\n')
      );

      const components = [];
      if (isSelf) {
        const tl = await translateText('Reroll', lang);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('reroll-aura')
            .setLabel(tl)
            .setStyle(ButtonStyle.Secondary) // grey button like you asked
            .setDisabled(!canReroll)
        );
        components.push(row);
      }

      // if this was triggered by original slash -> editReply
      // if this was triggered by button -> i.update (BUT: only valid for 3s window)
      // to avoid "Unknown interaction", after 2s we just edit the message instead
      if (!isRerollInteraction) {
        // first response to slash command
        await interactionLike.editReply({
          embeds: [mainEmbed],
          files: [attachment],
          components
        });
      } else {
        // refresh after reroll
        // try update() first, fallback to editReply() if expired
        try {
          await interactionLike.update({
            embeds: [mainEmbed],
            files: [attachment],
            components
          });
        } catch {
          // interaction expired -> just edit original message
          const msg = await interaction.fetchReply().catch(() => null);
          if (msg) {
            await interaction.editReply({
              embeds: [mainEmbed],
              files: [attachment],
              components
            }).catch(() => {});
          }
        }
      }

      return { componentsEnabled: components.length > 0 };
    };

    // send initial view
    await sendAuraView({ interactionLike: interaction, isRerollInteraction: false });

    // set up collector for reroll button
    const sentMessage = await interaction.fetchReply();
    const collector = sentMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000
    });

    collector.on('collect', async (btnInt) => {
      // wrong button? ignore
      if (btnInt.customId !== 'reroll-aura') return;

      // only self can reroll
      if (btnInt.user.id !== targetId) {
        const lan = getUserLanguage(btnInt.user.id) || 'en';
        const eembd = await getUserEmbed(btnInt.user.id, null, 'error');
        eembd.setDescription(
          await translateText('Only the aura owner can reroll.', lan)
        );
        return btnInt.reply({
          content: `<@${btnInt.user.id}>`,
          embeds: [eembd],
          ephemeral: true
        });
      }

      // cooldown check LIVE (not cached "now")
      const liveNow = Date.now();
      const lastUsed = cooldowns[targetId]?.time || 0;
      const canRerollNow = liveNow - lastUsed >= cooldownMs;

      if (!canRerollNow) {
        const nextReadyUnix = Math.floor((lastUsed + cooldownMs) / 1000);
        const lan = getUserLanguage(btnInt.user.id) || 'en';
        const eembd = await getUserEmbed(btnInt.user.id, null, 'error');
        eembd.setDescription(
          (await translateText('You must wait before rerolling again. Cooldown ends ', lan)) +
            `<t:${nextReadyUnix}:R>.`
        );
        return btnInt.reply({
          content: `<@${btnInt.user.id}>`,
          embeds: [eembd],
          ephemeral: true
        });
      }

      // do reroll with weighted odds
      const newAura = rollAura(isPlus);
      auraDB[targetId] = newAura;
      cooldowns[targetId] = { time: Date.now() };
      saveJSON(auraDataPath, auraDB);
      saveJSON(cooldownPath, cooldowns);

      await sendAuraView({
        interactionLike: btnInt,
        isRerollInteraction: true
      });
    });

    collector.on('end', async () => {
      // disable button after timeout so no stale reroll presses later
      const auraVal = auraDB[targetId];
      const rankName = getAuraRank(auraVal);

      const t1 = await translateText("Card", lang);
      const t2 = await translateText("Power:", lang);
      const t3 = await translateText("Rank:", lang);
      const t4 = await translateText("(Interaction expired — run /aura again to reroll)", lang);

      const disabledEmbed = await getUserEmbed(viewer.id, 'Aura');
      disabledEmbed.setTitle(`${targetUser.username}'s Aura ${t1}`);
      disabledEmbed.setDescription(
        [
          `**${t2}** ${formatNumber(auraVal)}`,
          `**${t3}** ${rankName}`,
          `\n${t4}`
        ].join('\n')
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('reroll-aura')
          .setLabel((await translateText('Reroll', lang)))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      // NOTE: we are NOT regenerating canvas here to save CPU after timeout
      sentMessage
        .edit({
          embeds: [disabledEmbed],
          components: [row]
        })
        .catch(() => {});
    });
  }
};
