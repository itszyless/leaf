const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const { translateText } = require('../utils/translator');
const { getUserLanguage } = require('../utils/langStorage');
const { getUserEmbed } = require('../utils/getUserEmbed');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
  const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get detailed information about a server using its invite code')
    .addStringOption(opt =>
      opt.setName('code')
        .setDescription('Invite code (e.g. abc123)')
        .setRequired(true)
    )
    .setDMPermission(true),

  category: 'Utility',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const code = interaction.options.getString('code').trim();

    try {
      const res = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`);
      if (!res.ok) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription(await translateText('Invalid or expired invite code.', lang));
        return interaction.ephemeralReply({ embeds: [err] });
      }

      const data = await res.json();
      const guild = data.guild || {};
      const inviter = data.inviter || {};
      const channel = data.channel || {};

      // translations
      const title = await translateText('Server Information', lang);
      const fieldName = await translateText('Name', lang);
      const fieldId = await translateText('Server ID', lang);
      const fieldDesc = await translateText('Description', lang);
      const fieldChannel = await translateText('Invite Channel', lang);
      const fieldInviter = await translateText('Inviter', lang);
      const fieldCash = await translateText('Cash', lang);
      const fieldVerify = await translateText('Verification Level', lang);
      const fieldNSFW = await translateText('NSFW Level', lang);
      const fieldFeatures = await translateText('Features', lang);
      const fieldMembers = await translateText('Members', lang);
      const fieldOnline = await translateText('Online', lang);

      // boost tier
      const cash = guild['pre' + 'mium_subscription_count'] || 0;
      let boostTier = 'None';
      if (cash >= 14) boostTier = 'Tier 3';
      else if (cash >= 7) boostTier = 'Tier 2';
      else if (cash >= 2) boostTier = 'Tier 1';

      // verification
      const verificationLevels = ['None', 'Low', 'Medium', 'High', 'Very High'];
      const verifyLevel = verificationLevels[guild.verification_level] || 'Unknown';

      // nsfw
      const nsfwLevels = ['Default', 'Explicit', 'Safe', 'Age-Restricted'];
      const nsfwLevel = nsfwLevels[guild.nsfw_level] || 'Unknown';

      // features
      const features = (guild.features || []).length
        ? guild.features.map(f => `?¢ ${f.replace(/_/g, ' ').toLowerCase()}`).join('\n')
        : '?”';

      // embed
      const embed = await getUserEmbed(interaction.user.id, title);
      embed
        .setTitle(`${guild.name || 'Unknown'} (${boostTier})`)
        .setDescription(guild.description || 'No description provided.')
        .setThumbnail(
          guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
            : null
        )
        .addFields(
          { name: fieldId, value: '``' + (guild.id || 'Unknown') + '``', inline: true },
          { name: fieldVerify, value: verifyLevel, inline: true },
          { name: fieldNSFW, value: nsfwLevel, inline: true },
          { name: fieldChannel, value: channel.name ? `#${channel.name}` : 'Unknown', inline: true },
          { name: fieldInviter, value: inviter.username ? `${inviter.username}#${inviter.discriminator}` : 'Unknown', inline: true },
          { name: fieldCash, value: `${cash} (${boostTier})`, inline: true },
          { name: fieldMembers, value: data.approximate_member_count?.toLocaleString() || '?”', inline: true },
          { name: fieldOnline, value: data.approximate_presence_count?.toLocaleString() || '?”', inline: true },
          { name: fieldFeatures, value: features.slice(0, 1024) }
        );

      if (guild.banner) {
        embed.setImage(`https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.png?size=1024`);
      } else if (guild.splash) {
        embed.setImage(`https://cdn.discordapp.com/splashes/${guild.id}/${guild.splash}.png?size=1024`);
      }

      // join button
      const joinButton = new ButtonBuilder()
        .setLabel(await translateText('Join Server', lang))
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.gg/${code}`);

      const row = new ActionRowBuilder().addComponents(joinButton);

      return interaction.ephemeralReply({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('ServerInfo command error:', err);
      const e = await getUserEmbed(interaction.user.id, null, 'error');
      e.setDescription('?? Failed to fetch server information.');
      return interaction.ephemeralReply({ embeds: [e], ephemeral: true });
    }
  },
};

