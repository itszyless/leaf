const { SlashCommandBuilder } = require('discord.js');
const embedUtils = require('../utils/getUserEmbed');
const { parseTimestamp, STYLES } = require('../utils/timestamp');
const { timezoneChoices } = require('../utils/timezones');

module.exports = {
  category: 'Utility',
  data: new SlashCommandBuilder()
    .setName('timestamp')
    .setDescription('Turn a date, clock time or future duration into a Discord timestamp')
    .addStringOption(option => option.setName('time')
      .setDescription('e.g. 23:12, 11 PM, tomorrow at 7pm, in 2 hours, 2h30m, or 2027-04-20 14:00')
      .setRequired(true).setMaxLength(200))
    .addStringOption(option => option.setName('timezone')
      .setDescription('Search a city/region (Vienna, New York, Asia) or enter UTC+05:30. Default: UTC')
      .setAutocomplete(true).setMaxLength(100))
    .addStringOption(option => option.setName('format').setDescription('Timestamp display style (default: all styles)')
      .addChoices({ name: 'All styles', value: 'all' }, ...Object.entries(STYLES).map(([value, name]) => ({ name, value }))))
    .addStringOption(option => option.setName('date_order').setDescription('Numeric date order; ISO YYYY-MM-DD always works')
      .addChoices({ name: 'Day / month / year (default)', value: 'dmy' }, { name: 'Month / day / year', value: 'mdy' }))
    .addStringOption(option => option.setName('occurrence').setDescription('When daylight saving repeats a clock time, which occurrence?')
      .addChoices({ name: 'Earlier occurrence (default)', value: 'earlier' }, { name: 'Later occurrence', value: 'later' })),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const choices = focused.name === 'timezone' ? timezoneChoices(focused.value) : [];
    return interaction.respond(choices).catch(() => {});
  },

  async execute(interaction) {
    let parsed;
    try {
      parsed = parseTimestamp(interaction.options.getString('time'), {
        timezone: interaction.options.getString('timezone') || 'UTC',
        dateOrder: interaction.options.getString('date_order') || 'dmy',
        occurrence: interaction.options.getString('occurrence') || 'earlier',
      });
    } catch (error) {
      const embed = await embedUtils.getUserEmbed(interaction.user.id, 'Timestamp', true);
      embed.setDescription(error.message);
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
    const format = interaction.options.getString('format') || 'all';
    const styles = format === 'all' ? Object.keys(STYLES) : [format];
    const embed = await embedUtils.getUserEmbed(interaction.user.id, 'Timestamp');
    embed.setTitle('Discord timestamp')
      .setDescription(`**Interpreted as:** ${parsed.dateTime.toFormat('yyyy-MM-dd HH:mm:ss')}\n` +
        `**Timezone:** ${parsed.zone} (UTC${parsed.dateTime.toFormat('ZZ')})\n\n` +
        'Copy a code below into Discord. Each reader sees it in their own timezone.' +
        (parsed.notes.length ? '\n\n' + parsed.notes.join('\n') : ''))
      .addFields(styles.map(style => ({ name: STYLES[style],
        value: `<t:${parsed.unix}:${style}>\n\`<t:${parsed.unix}:${style}>\``, inline: false })));
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
