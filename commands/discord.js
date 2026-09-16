const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

function cleanInvite(input) {
  return String(input || '').trim().replace(/^https?:\/\/(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\//i, '').split(/[/?#]/)[0];
}

function emojiInfo(value) {
  const match = String(value || '').trim().match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);
  if (!match) return null;
  const animated = value.startsWith('<a:');
  return { name: match[1], id: match[2], animated, url: `https://cdn.discordapp.com/emojis/${match[2]}.${animated ? 'gif' : 'png'}` };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('discord')
    .setDescription('Discord utility tools')
    .addSubcommand(sub => sub
      .setName('emoji')
      .setDescription('Get the CDN URL of a Discord emoji')
      .addStringOption(opt => opt.setName('emoji').setDescription('Custom Discord emoji').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('server')
      .setDescription('Look up a Discord server via invite link or code')
      .addStringOption(opt => opt.setName('invite').setDescription('Invite link or code').setRequired(true))),
  category: 'Utility',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const embed = await getUserEmbed(interaction.user.id, 'Discord');

    if (sub === 'emoji') {
      const info = emojiInfo(interaction.options.getString('emoji'));
      if (!info) {
        embed.setTitle('Invalid Emoji').setDescription('Please enter a custom Discord emoji, like `<:name:id>` or `<a:name:id>`.');
        return interaction.editReply({ embeds: [embed] });
      }
      embed.setTitle('Emoji CDN URL').setDescription(`Name: **${info.name}**
ID: \`${info.id}\`
Animated: **${info.animated ? 'Yes' : 'No'}**
URL: ${info.url}`).setThumbnail(info.url);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'server') {
      const code = cleanInvite(interaction.options.getString('invite'));
      if (!/^[a-zA-Z0-9-_]{2,64}$/.test(code)) {
        embed.setTitle('Invalid Invite').setDescription('Please enter a valid Discord invite link or code.');
        return interaction.editReply({ embeds: [embed] });
      }
      const res = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`).catch(() => null);
      if (!res || !res.ok) {
        embed.setTitle('Invite Not Found').setDescription('That invite is invalid, expired, or unavailable.');
        return interaction.editReply({ embeds: [embed] });
      }
      const data = await res.json();
      const guild = data.guild || {};
      const channel = data.channel || {};
      embed.setTitle(guild.name || 'Discord Server')
        .setThumbnail(guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : null)
        .addFields(
          { name: 'Server ID', value: guild.id ? `\`${guild.id}\`` : 'Unknown', inline: true },
          { name: 'Invite Code', value: `\`${code}\``, inline: true },
          { name: 'Channel', value: channel.name ? `#${channel.name}` : 'Unknown', inline: true },
          { name: 'Members', value: data.approximate_member_count?.toLocaleString() || 'Unknown', inline: true },
          { name: 'Online', value: data.approximate_presence_count?.toLocaleString() || 'Unknown', inline: true },
        );
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(`https://discord.gg/${code}`));
      return interaction.editReply({ embeds: [embed], components: [row] });
    }
  },
};

