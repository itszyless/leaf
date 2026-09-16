const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
async function request(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  return fetch(url, { agent: httpsAgent, ...options });
}
const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

function meta(html, property) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const match = html.match(re);
  return match ? match[1].replace(/&amp;/g, '&') : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snapchat')
    .setDescription('Snapchat lookup')
    .addSubcommand(sub => sub
      .setName('user')
      .setDescription('Get Snapchat user info')
      .addStringOption(opt => opt.setName('username').setDescription('Snapchat username').setRequired(true).setMaxLength(32))),
  category: 'Utility',

  async execute(interaction) {
    const username = interaction.options.getString('username').replace(/^@/, '').trim();
    const embed = await getUserEmbed(interaction.user.id, 'Snapchat User');
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      embed.setTitle('Invalid Username').setDescription('Please enter a valid Snapchat username.');
      return interaction.editReply({ embeds: [embed] });
    }

    try {
      const url = `https://www.snapchat.com/add/${encodeURIComponent(username)}`;
      const res = await request(url, { headers: { 'User-Agent': 'Mozilla/5.0 leaf Discord Bot' } });
      const html = await res.text();
      if (!res.ok) throw new Error(`Snapchat returned HTTP ${res.status}`);
      const title = meta(html, 'og:title') || `@${username}`;
      const description = meta(html, 'og:description') || 'Snapchat profile';
      const image = meta(html, 'og:image');
      embed.setTitle(title).setURL(url).setDescription(description);
      if (image) embed.setThumbnail(image);
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      embed.setTitle('Snapchat Lookup Failed').setDescription(error.message || 'Could not fetch that Snapchat user.');
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
