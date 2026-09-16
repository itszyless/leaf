const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
async function request(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  return fetch(url, { agent: httpsAgent, ...options });
}
const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

function trimLyrics(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  return value.length > 3800 ? `${value.slice(0, 3790)}...` : value;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Get lyrics for a song')
    .addStringOption(opt => opt.setName('song').setDescription('Song name').setRequired(true).setMaxLength(100)),
  category: 'Utility',

  async execute(interaction) {
    const song = interaction.options.getString('song');
    const embed = await getUserEmbed(interaction.user.id, 'Lyrics');
    try {
      const res = await request(`https://lrclib.net/api/search?q=${encodeURIComponent(song)}`, {
        headers: { 'User-Agent': 'leaf Discord Bot' },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(data) || !data.length) throw new Error('No lyrics found for that song.');
      const hit = data.find(item => item.plainLyrics) || data[0];
      const lyrics = trimLyrics(hit.plainLyrics || hit.syncedLyrics);
      if (!lyrics) throw new Error('No lyrics found for that song.');
      embed
        .setTitle(`${hit.trackName || song}${hit.artistName ? ` - ${hit.artistName}` : ''}`)
        .setDescription(lyrics)
        .setFooter({ text: 'Lyrics from LRCLIB' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      embed.setTitle('Lyrics Not Found').setDescription(error.message || 'Could not fetch lyrics right now.');
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
