const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const themesPath = path.join(__dirname, '../data/embedLayouts.json');

function formatNumber(num) {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('topthemes')
    .setDescription('Show the top 10 most used themes')
    .setDMPermission(true),

  category: 'Plus',
  hidden: true,

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const themes = JSON.parse(fs.readFileSync(themesPath, 'utf8'));

    const sorted = Object.entries(themes)
      .sort((a, b) => (b[1].uses || 0) - (a[1].uses || 0))
      .slice(0, 10);

    const errEmbed = (await getUserEmbed(interaction.user.id, null, 'error'))
    errEmbed.setDescription(await translateText('No themes found.', lang));

    const embed = (await getUserEmbed(interaction.user.id, 'Top Themes'))
    embed.setTitle(await translateText('🏆 Top Themes', lang));

    if (sorted.length === 0) {
        return await interaction.editReply({ embeds: [errEmbed], ephemeral: true });
    } else {
      const p1 = await translateText('ID', lang);
      const p4 = await translateText('Name', lang);
      const p2 = await translateText('Uses', lang);
      const p3 = await translateText('Creator', lang);
      const p5 = await translateText('Unknown', lang);
      embed.setDescription(
        sorted.map(([id, theme], index) =>
          `#${index + 1} — ${p1}: \`${id}\`\n> ${config['Arrow-Icon']} ${p4}: ${theme.name || p5}\n> ${config['Arrow-Icon']} ${p2}: **${formatNumber(theme.uses || 0)}**\n> ${config['Arrow-Icon']} ${p3}: <@${theme.creator_id}>`
        ).join('\n')
      );
    }

    await interaction.editReply({ embeds: [embed], ephemeral: true });
  }
};

