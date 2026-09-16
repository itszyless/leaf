const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { Profile } = require('discord-arts');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const plusPath = path.join(__dirname, '../data/plusUsers.json');

const { abbreviate } = require('../utils/abbreviate');

const { getUserEmbed } = require('../utils/getUserEmbed');

function loadPlus() {
  return fs.existsSync(plusPath) ? JSON.parse(fs.readFileSync(plusPath, 'utf8')) : {};
}

const rankSettingsPath = path.join(__dirname, '../data/rank-settings.json');
const xpPath = path.join(__dirname, '../data/xp.json');

function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function getLevelFromXP(xp) {
  return Math.floor(0.2 * Math.sqrt(xp));
}

function getXPForLevel(level) {
  return Math.floor((level / 0.2) ** 2);
}

function loadRankSettings() {
  if (!fs.existsSync(rankSettingsPath)) return {};
  return JSON.parse(fs.readFileSync(rankSettingsPath, 'utf8'));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription("Check your or another user's level")
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to check')
        .setRequired(false)),
  category: 'Rank',

  async execute(interaction) {
    
    const admins = loadJSON(path.join(__dirname, '../data/admins.json'));

    const lang = getUserLanguage(interaction.user.id) || 'en';
    const user = interaction.options.getUser('user') || interaction.user;
    const userId = user.id;

    if (user.bot) {
      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(await translateText('Bots do not have any xp.', lang))

      return interaction.editReply({ embeds: [embed] });
    }

    let data = {};
    if (fs.existsSync(xpPath)) {
      data = JSON.parse(fs.readFileSync(xpPath, 'utf8'));
    }

    if (!data[userId]) {
      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(await translateText('This user has no xp yet.', lang))

      return interaction.editReply({ embeds: [embed] });
    }

    const userData = data[userId];
    const xp = userData.xp || 0;
    const level = getLevelFromXP(xp);
    const nextLevelXP = getXPForLevel(level + 1);
    const currentXP = xp - getXPForLevel(level);
    const requiredXP = nextLevelXP - getXPForLevel(level);

    const getUserRank = (userId) => {
      const sorted = Object.entries(data)
        .filter(([, val]) => typeof val.xp === 'number')
        .sort(([, a], [, b]) => b.xp - a.xp);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i][0] === userId) return i + 1;
      }
      return 0;
    };

    const getUserPresence = () => {
      const member = interaction.guild?.members.cache.get(userId);
      const isCard = isCardEnabled ? "online" : "in development";
      return member?.presence?.status || isCard;
    };

    const rankSettings = loadRankSettings();
    const userSettings = rankSettings[userId] || {};
    const isCardEnabled = userSettings.card !== false;
    const background = userSettings.background || path.join(__dirname, '../assets/levelbg.png');
    const visibility = userSettings.visibility || 'everyone';

    // === Visibility restriction ===
    if (userId !== interaction.user.id && visibility === 'private') {
      // Admins and Owner can always see private ranks
      if (!admins[interaction.user.id] && interaction.user.id !== config.Owner_ID) {
        const err = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(await translateText('This user has set their rank to private.', lang));
        return interaction.editReply({ embeds: [err] });
      }
    }

    const showXP = userSettings.showXP !== false;
    const showLevel = userSettings.showLevel !== false;

    const plusData = loadPlus();

    const getUserTitle = () => {
      if(userId === config.Owner_ID) {
        return 'Owner';
      } else if (admins[userId]) {
        return 'Admin';
      } else if (plusData[userId]) {
        return 'Plus';
       } else {
        return 'User';
      }
    };

    let cBadges = [];

    if (plusData[userId]) {
      cBadges.push(path.resolve(__dirname, '../assets/badges/Plus.png'));
    }   

    if (admins[userId]) {
      cBadges.push(path.resolve(__dirname, '../assets/badges/Admin.png'));
    }

    if (userId === config.Owner_ID) {
      cBadges.push(path.resolve(__dirname, '../assets/badges/Owner.png'));
    }
    
    let _usernameColor = '#ffffff';
    /*
    if (userId === config.Owner_ID) {
      _usernameColor = '#FAC000';
    } else if (admins[userId]) {
      _usernameColor = '#FF4B4B';
    } else if (plusData[userId]) {
      _usernameColor = '#4DA6FF';
    }
    */

    if (isCardEnabled) {
      const buffer = await Profile(userId, {
        customBadges: cBadges,
        customUsername: user.username,
        usernameColor: _usernameColor,
        squareAvatar: false,
        presenceStatus: getUserPresence(),
        badgesFrame: true,
        customDate: getUserTitle(),
        customBackground: background,
        moreBackgroundBlur: true,
        backgroundBrightness: 25,
        customTag: await translateText('Level Progress', lang),
        customSubtitle: showXP
          ? `${abbreviate(currentXP, "prefix")} / ${abbreviate(requiredXP, "prefix")} XP`
          : await translateText('XP Hidden', lang),
        rankData: {
          currentXp: showXP ? currentXP : 0,
          requiredXp: showXP ? requiredXP : 1,
          rank: getUserRank(userId),
          level: showLevel ? level : 0,
          barColor: config.Level_Bar_Color,
          levelColor: '#ada8c6',
          autoColorRank: true,
          hideXp: !showXP,
          hideLevel: !showLevel
        }
      });

      const attachment = new AttachmentBuilder(buffer, { name: 'level.png' });
      await interaction.editReply({ files: [attachment] });
    } else {
      // --- EMBED VERSION (if card disabled) ---
    const _levelText = await translateText('Level', lang);
    const _xpText = await translateText('XP', lang);
    const _progressText = `${abbreviate(currentXP, "prefix")} / ${abbreviate(requiredXP, "prefix")} XP`;
    const _rank = getUserRank(userId);
    const _progressPercent = ((currentXP / requiredXP) * 100).toFixed(1);

    const embed = new EmbedBuilder()
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setTitle(await translateText('Level Overview', lang))
      .setColor(config.Level_Bar_Color)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        `**${await translateText('Title', lang)}:** ${getUserTitle()}\n` +
        `**${await translateText('Rank', lang)}:** #${_rank}\n` +
        `**${await translateText('Presence', lang)}:** ${getUserPresence()}`
      )
      .setFooter({ text: config.Footer || 'Level System', iconURL: interaction.client.user.displayAvatarURL() })
      .setTimestamp();

      if (showLevel) {
        embed.addFields(
          { name: _levelText, value: `${level}`, inline: true }
        );
      }

      if (showXP) {
        embed.addFields(
          { name: _xpText, value: _progressText, inline: true },
          { name: await translateText('Progress', lang),
            value: `▰`.repeat(Math.round(_progressPercent / 10)) + `▱`.repeat(10 - Math.round(_progressPercent / 10)) + ` **${_progressPercent}%**`,
            inline: false }
        );
      }


    return interaction.editReply({ embeds: [embed] });
    }
  }
};
