// commands/slash/timezone.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

const COMMON_TIMEZONES = [
  'UTC',
  'Europe/Vienna',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Africa/Johannesburg'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timezone')
    .setDescription('Convert time between timezones or show current time (Plus only)')
    .addStringOption(opt =>
      opt.setName('from')
        .setDescription('Source timezone or local')
        .setRequired(true)
        .addChoices(
          { name: 'Local time', value: 'local' },
          ...COMMON_TIMEZONES.map(tz => ({ name: tz, value: tz }))
        )
    )
    .addStringOption(opt =>
      opt.setName('to')
        .setDescription('Target timezone')
        .setRequired(true)
        .addChoices(
          ...COMMON_TIMEZONES.map(tz => ({ name: tz, value: tz }))
        )
    )
    .addStringOption(opt =>
      opt.setName('time')
        .setDescription('Time to convert (HH:mm, 24-hour). If empty, current time is used.')
        .setRequired(false)
    ),
  category: 'Plus',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const from = interaction.options.getString('from');
    const to = interaction.options.getString('to');
    const timeInput = interaction.options.getString('time'); // optional HH:mm format

    try {
      // Determine the base DateTime object
      let baseTime;

      if (from === 'local') {
        // Local time in user’s local zone (assume system timezone)
        baseTime = timeInput
          ? DateTime.fromFormat(timeInput, 'HH:mm')
          : DateTime.local();
      } else {
        // Timezone specified
        if (timeInput) {
          baseTime = DateTime.fromFormat(timeInput, 'HH:mm', { zone: from });
        } else {
          baseTime = DateTime.now().setZone(from);
        }
      }

      if (!baseTime.isValid) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(await translateText('Invalid time format. Please use HH:mm (24-hour).', lang));
        return interaction.editReply({ embeds: [embed] });
      }

      // Convert to target timezone
      const converted = baseTime.setZone(to);
      if (!converted.isValid) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(await translateText('Invalid target timezone.', lang));
        return interaction.editReply({ embeds: [embed] });
      }

      // Build output embed
      const embed = (await getUserEmbed(interaction.user.id, 'Timezone Conversion'))
        .setTitle(await translateText('Time Zone Conversion', lang))
        .addFields(
          {
            name: await translateText('From', lang),
            value: `${from === 'local' ? 'Local Time' : from}\n` +
                   (timeInput ? `**${timeInput}**` : `**${baseTime.toFormat('HH:mm')}**`) +
                   ` (${baseTime.toFormat('cccc, dd LLL yyyy')})`,
            inline: true
          },
          {
            name: await translateText('To', lang),
            value: `${to}\n**${converted.toFormat('HH:mm')}** (${converted.toFormat('cccc, dd LLL yyyy')})`,
            inline: true
          }
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Timezone Command Error:', error);
      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(await translateText('An error occurred while converting timezones.', lang));
      return interaction.editReply({ embeds: [embed] });
    }
  }
};
