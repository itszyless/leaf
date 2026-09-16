// commands/slash/weatherforecast.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather-forecast')
    .setDescription('Get weather forecast for a city (1 to 7 days, Plus only)')
    .addStringOption(opt =>
      opt.setName('city')
        .setDescription('City name, e.g., Berlin')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('days')
        .setDescription('Number of days to forecast (1–7)')
        .setMinValue(1)
        .setMaxValue(7)
        .setRequired(true)
    ),
  category: 'Plus',
  hidden: true,

  async execute(interaction) {
    const city = interaction.options.getString('city');
    const days = interaction.options.getInteger('days');
    const lang = getUserLanguage(interaction.user.id) || 'en';

    try {
      // Get coordinates for city
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${lang}`);
      const geo = await geoRes.json();
      if (!geo.results || geo.results.length === 0) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(await translateText('City couldn\'t be found.', lang));
        return interaction.editReply({ embeds: [embed] });
      }
      const { latitude, longitude, name, country } = geo.results[0];

      // Fetch daily forecast data from Open-Meteo
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
      const weatherRes = await fetch(weatherUrl);
      const w = await weatherRes.json();
      if (!w.daily) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(await translateText('Weather forecast data is unavailable.', lang));
        return interaction.editReply({ embeds: [embed] });
      }

      // Prepare forecast fields, limited to user-requested days
      const weatherCodes = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        56: 'Light freezing drizzle',
        57: 'Dense freezing drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        66: 'Light freezing rain',
        67: 'Heavy freezing rain',
        71: 'Slight snow fall',
        73: 'Moderate snow fall',
        75: 'Heavy snow fall',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail'
      };

      const fields = [];
      for (let i = 0; i < days; i++) {
        const date = w.daily.time[i];
        const maxTemp = w.daily.temperature_2m_max[i];
        const minTemp = w.daily.temperature_2m_min[i];
        const code = w.daily.weathercode[i];
        const condition = weatherCodes[code] || 'Unknown';

        fields.push({
          name: date,
          value: `🌡 Max: ${maxTemp} °C\n🌡 Min: ${minTemp} °C\n📝 Condition: ${condition}`,
          inline: false
        });
      }

      const embed = (await getUserEmbed(interaction.user.id, 'Weather Forecast'))
        .setTitle(await translateText(`Weather forecast for ${name}, ${country}`, lang))
        .addFields(fields)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Weather Forecast Command Error:', error);
      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(await translateText('Could not fetch the weather forecast.', lang));
      return interaction.editReply({ embeds: [embed] });
    }
  }
};

