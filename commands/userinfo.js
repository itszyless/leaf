const { ContextMenuCommandBuilder, ApplicationCommandType, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('../config.json');
const { translateText } = require('../utils/translator');
const { getUserLanguage } = require('../utils/langStorage');

const { getUserEmbed } = require('../utils/getUserEmbed');
  const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to get info about')
        .setRequired(false))
    .setDMPermission(true),
  category: 'Utility',

  async execute(interaction) {


    try {
    const userLang = getUserLanguage(interaction.user.id) || 'en';
    const user = interaction.options.getUser('user') || interaction.user;
    const userFetch = await interaction.client.users.fetch(user.id, { force: true });

      // creation info
      const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`;
      const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24));

      // translations
      const title = await translateText('User Information', userLang);
      const fieldUser = await translateText('Username', userLang);
      const fieldDiscrim = await translateText('Tag', userLang);
      const fieldId = await translateText('User ID', userLang);
      const fieldCreated = await translateText('Created at', userLang);
      const fieldAge = await translateText('Account Age', userLang);
      const fieldBot = await translateText('Bot Account', userLang);
      const yesText = await translateText('Yes', userLang);
      const noText = await translateText('No', userLang);
      const daysText = await translateText('days old', userLang);
      const avatarText = await translateText('Open Avatar', userLang);

      // base embed
      const embed = await getUserEmbed(interaction.user.id, 'User Info');
      embed
        .setTitle(`${title}`)
        .setThumbnail(user.displayAvatarURL({ size: 512, extension: 'png', forceStatic: false }))
        .addFields(
          { name: fieldUser, value: user.username || 'Unknown', inline: true },
          { name: fieldDiscrim, value: user.discriminator === '0' ? '?”' : `#${user.discriminator}`, inline: true },
          { name: fieldId, value: '``' + user.id + '``', inline: false },
          { name: fieldCreated, value: createdAt, inline: false },
          { name: fieldAge, value: `${accountAgeDays.toLocaleString()} ${daysText}`, inline: true },
          { name: fieldBot, value: user.bot ? yesText : noText, inline: true },
        );

      // optional banner (only for normal bots, if accessible)
      if (user.banner) {
        embed.setImage(user.bannerURL({ size: 512, extension: 'png', forceStatic: false }));
      }

      // button for avatar
      const avatarButton = new ButtonBuilder()
        .setLabel(avatarText)
        .setStyle(ButtonStyle.Link)
        .setURL(user.displayAvatarURL({ size: 2048, extension: 'png', forceStatic: false }));

      const row = new ActionRowBuilder().addComponents(avatarButton);

      await interaction.ephemeralReply({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('Userinfo context error:', err);
      const e = await getUserEmbed(interaction.user.id, null, 'error');
      e.setDescription('?? Failed to fetch user information.');
      return interaction.ephemeralReply({ embeds: [e], ephemeral: true });
    }
  }
};

