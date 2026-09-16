const { SlashCommandBuilder } = require('discord.js');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

function wordCount(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('textstats')
    .setDescription('Analyze text statistics like words, length, and reading time')
    .addStringOption(o =>
      o.setName('text')
        .setDescription('Text to analyze (min 3 words)')
        .setRequired(true))
    .setDMPermission(true),

  category: 'Misc',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const text = interaction.options.getString('text');
    const wc = wordCount(text);

    if (wc < 3) {
      const e = await getUserEmbed(interaction.user.id, null, 'error');
      e.setDescription(await translateText('Please enter at least 3 words.', lang));
      return interaction.ephemeralReply({ embeds: [e] });
    }

    const sentences = text.match(/[^.!?]+[.!?]?/g) || [];
    const chars = text.length;
    const avgSentenceLen = sentences.length ? (wc / sentences.length).toFixed(1) : wc;

    // reading speed = 200 words/min
    const minutes = wc / 200;
    let readTime;
    if (minutes < 1) {
      const seconds = Math.round(minutes * 60);
      readTime = `${seconds} sec`;
    } else {
      // trim trailing zeros for natural display
      const formatted = parseFloat(minutes.toFixed(2)).toString();
      readTime = `${formatted} min`;
    }

    const embed = await getUserEmbed(interaction.user.id, 'Text Statistics');
    embed.setDescription(
      `**Words:** ${wc}\n` +
      `**Characters:** ${chars}\n` +
      `**Sentences:** ${sentences.length}\n` +
      `**Avg sentence length:** ${avgSentenceLen} words\n` +
      `**Estimated reading time:** ${readTime}`
    );

    return interaction.ephemeralReply({ embeds: [embed] });
  },
};
