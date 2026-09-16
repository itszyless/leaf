const { SlashCommandBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mcstats')
    .setDMPermission(true)
    .setDescription('Get Minecraft server or player stats')
    .addSubcommand(sub =>
      sub
        .setName('server')
        .setDescription('Get information about a Minecraft server')
        .addStringOption(opt =>
          opt
            .setName('address')
            .setDescription('Server IP or domain, e.g. hypixel.net or example.com:25565')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('user')
        .setDescription('Get information about a Minecraft player')
        .addStringOption(opt =>
          opt
            .setName('username')
            .setDescription('Minecraft username')
            .setRequired(true)
        )
    ),

  category: 'Utility',

  async execute(interaction) {
    const userId = interaction.user.id;
    const userLang = getUserLanguage(userId) || 'en';
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'server') {
        const addressInput = interaction.options.getString('address').trim();

        const titleText = await translateText('Minecraft server stats', userLang);
        const fetchingText = await translateText('Fetching server information, please wait.', userLang);
        const offlineText = await translateText('The server appears to be offline or unreachable.', userLang);
        const errorText = await translateText('Could not fetch server data. Please try again later.', userLang);
        const addressLabel = await translateText('Address', userLang);
        const ipLabel = await translateText('IP', userLang);
        const versionLabel = await translateText('Version', userLang);
        const playersLabel = await translateText('Players', userLang);
        const motdLabel = await translateText('MOTD', userLang);
        const onlineLabel = await translateText('Online', userLang);
        const offlineLabel = await translateText('Offline', userLang);

        const loadingEmbed = (await getUserEmbed(userId, 'Minecraft'))
          .setTitle(titleText)
          .setDescription(fetchingText);

        await interaction.editReply({ embeds: [loadingEmbed] });

        const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(addressInput)}`;
        const res = await fetch(url);

        if (!res.ok) {
          const errorEmbed = (await getUserEmbed(userId, null, 'error'))
            .setDescription(errorText);

          return interaction.editReply({ embeds: [errorEmbed] });
        }

        const data = await res.json();

        if (!data || data.online !== true) {
          const offlineEmbed = (await getUserEmbed(userId, null, 'error'))
            .setTitle(titleText)
            .setDescription(offlineText);

          return interaction.editReply({ embeds: [offlineEmbed] });
        }

        const embed = (await getUserEmbed(userId, 'Minecraft'))
          .setTitle(titleText);

        const ip = data.ip || addressInput;
        const port = data.port || 25565;
        const version = data.version || 'Unknown';
        const playerOnline = data.players && typeof data.players.online === 'number'
          ? data.players.online
          : 0;
        const playerMax = data.players && typeof data.players.max === 'number'
          ? data.players.max
          : 0;

        const motdLines = [];
        if (data.motd) {
          if (Array.isArray(data.motd.clean)) {
            motdLines.push(...data.motd.clean);
          } else if (typeof data.motd.clean === 'string') {
            motdLines.push(data.motd.clean);
          }
        }
        const motd = motdLines.join('\n') || '-';

        const statusText = data.online ? onlineLabel : offlineLabel;

        embed.addFields(
          { name: addressLabel, value: addressInput, inline: true },
          { name: ipLabel, value: ip + ':' + port, inline: true },
          { name: versionLabel, value: version, inline: true },
          { name: playersLabel, value: `${playerOnline}/${playerMax}`, inline: true },
          { name: motdLabel, value: motd, inline: false }
        );

        embed.setFooter({ text: statusText });

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'user') {
        const usernameInput = interaction.options.getString('username').trim();

        const titleText = await translateText('Minecraft player stats', userLang);
        const fetchingText = await translateText('Fetching player information, please wait.', userLang);
        const notFoundText = await translateText('Player not found. Check the name and try again.', userLang);
        const errorText = await translateText('Could not fetch player data. Please try again later.', userLang);
        const nameLabel = await translateText('Name', userLang);
        const uuidLabel = await translateText('UUID', userLang);
        const historyLabel = await translateText('Name history', userLang);
        const profileLabel = await translateText('Profile', userLang);

        const loadingEmbed = (await getUserEmbed(userId, 'Minecraft'))
          .setTitle(titleText)
          .setDescription(fetchingText);

        await interaction.editReply({ embeds: [loadingEmbed] });

        // Player info via playerdb.co API
        const url = `https://playerdb.co/api/player/minecraft/${encodeURIComponent(usernameInput)}`;
        const res = await fetch(url);

        if (!res.ok) {
          const errorEmbed = (await getUserEmbed(userId, null, 'error'))
            .setDescription(errorText);

          return interaction.editReply({ embeds: [errorEmbed] });
        }

        const json = await res.json();

        if (!json || json.success !== true || !json.data || !json.data.player) {
          const notFoundEmbed = (await getUserEmbed(userId, null, 'error'))
            .setTitle(titleText)
            .setDescription(notFoundText);

          return interaction.editReply({ embeds: [notFoundEmbed] });
        }

        const player = json.data.player;
        const username = player.username || usernameInput;
        const uuid = player.id || 'Unknown';

        let nameHistoryText = '-';
        if (player.meta && Array.isArray(player.meta.name_history) && player.meta.name_history.length > 0) {
          nameHistoryText = player.meta.name_history
            .map(entry => entry.name)
            .join(', ');
        }

        const avatarUrl = `https://mc-heads.net/avatar/${uuid}/128.png`;
        const profileUrl = `https://namemc.com/profile/${uuid}`;

        const embed = (await getUserEmbed(userId, 'Minecraft'))
          .setTitle(titleText)
          .setThumbnail(avatarUrl);

        embed.addFields(
          { name: nameLabel, value: username, inline: true },
          { name: uuidLabel, value: uuid, inline: false },
          { name: historyLabel, value: nameHistoryText, inline: false },
          { name: profileLabel, value: profileUrl, inline: false }
        );

        return interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Error in /mcstats:', err);
      const fallbackText = await translateText('An unexpected error occurred.', userLang);
      const errorEmbed = (await getUserEmbed(userId, null, 'error'))
        .setDescription(fallbackText);

      return interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

