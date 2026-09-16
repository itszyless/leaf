const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const { abbreviate } = require('../utils/abbreviate');

const xpPath = path.join(__dirname, '../data/xp.json');
const rankSettingsPath = path.join(__dirname, '../data/rank-settings.json');

/* ───────────────────────── helpers ───────────────────────── */

function getLevelFromXP(xp) {
  return Math.floor(0.2 * Math.sqrt(xp));
}

function loadJSON(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/* ───────────────────────── command ───────────────────────── */

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levelboard')
    .setDescription('Show the top 10 users by XP or level.'),
  category: 'Rank',

  async execute(interaction) {
    const lang = (await getUserLanguage(interaction.user.id)) || 'en';
    const xpData = loadJSON(xpPath);
    const rankSettings = loadJSON(rankSettingsPath);

    // Filter: must have valid xp AND be at least level 1
    const sortedUsers = Object.entries(xpData)
      .filter(([, val]) => typeof val.xp === 'number' && getLevelFromXP(val.xp) >= 1)
      .sort(([, a], [, b]) => b.xp - a.xp)
      .slice(0, 10);

    const embed = await getUserEmbed(interaction.user.id, 'Leaderboard');
    embed.setTitle(await translateText('🏆 Level Leaderboard', lang));

    if (sortedUsers.length === 0) {
      embed.setDescription(await translateText('No users have reached level 1 yet.', lang));
      return interaction.editReply({ embeds: [embed] });
    }

    const lines = [];

    for (let i = 0; i < sortedUsers.length; i++) {
      const [id, val] = sortedUsers[i];
      const user = await interaction.client.users.fetch(id).catch(() => null);
      const xp = val.xp || 0;
      const level = getLevelFromXP(xp);

      const settings = rankSettings[id] || {};
      const visibility = settings.visibility || 'everyone';
      const showXP = settings.showXP !== false;
      const showLevel = settings.showLevel !== false;

      const isPrivate = visibility === 'private';
      const username = user ? user.username : 'Unknown User';
      const displayName = `${username} \`(${id})\``;

      const lvlDisplay = isPrivate || !showLevel ? '??' : level.toString();
      const xpDisplay = isPrivate || !showXP ? '??' : abbreviate(xp, "prefix");

      lines.push(
        `**#${i + 1}** ${displayName} — 🧭 **Lvl ${lvlDisplay}** (${xpDisplay} XP)`
      );
    }

    embed.setDescription(lines.join('\n'));

    await interaction.editReply({ embeds: [embed] });
  }
};
