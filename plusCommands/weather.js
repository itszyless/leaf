const { SlashCommandBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

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
function weatherIcon(code) {
  if (code === 0) return '☀️';
  if ([1, 2].includes(code)) return '🌤️';
  if (code === 3) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '🌡️';
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function tempBar(min, max) {
  const cold = Number(min) <= 5 ? '🟦' : Number(min) <= 18 ? '🟩' : '🟨';
  const hot = Number(max) >= 28 ? '🟥' : Number(max) >= 20 ? '🟧' : '🟩';
  return `${cold}${cold}${hot}${hot}`;
}
async function resolveCity(city, lang) {
  const geoRes = await fetch(`http://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${lang}`);
  const geo = await geoRes.json();
  return geo.results?.[0] || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Weather tools (Plus only)')
    .addSubcommand(sub =>
      sub
        .setName('current')
        .setDescription('Get current weather for a city.')
        .addStringOption(opt =>
          opt.setName('city')
            .setDescription('City name, e.g., Berlin')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('forecast')
        .setDescription('Get a 1 to 7 day weather forecast for a city.')
        .addStringOption(opt =>
          opt.setName('city')
            .setDescription('City name, e.g., Berlin')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('days')
            .setDescription('Number of days to forecast (1-7)')
            .setMinValue(1)
            .setMaxValue(7)
            .setRequired(true)
        )
    ),
  category: 'Plus',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(false) || 'current';
    const city = interaction.options.getString('city');
    const lang = getUserLanguage(interaction.user.id) || 'en';

    try {
      const place = await resolveCity(city, lang);
      if (!place) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(await translateText('City couldn\'t be found.', lang));
        return interaction.editReply({ embeds: [embed] });
      }

      const { latitude, longitude, name, country } = place;

      if (subcommand === 'forecast') {
        const days = interaction.options.getInteger('days');
        const weatherUrl = `http://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,wind_speed_10m_max&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        const forecast = await weatherRes.json();

        if (!forecast.daily) {
          const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
            .setDescription(await translateText('Weather forecast data is unavailable.', lang));
          return interaction.editReply({ embeds: [embed] });
        }

        const fields = [];
        let warmest = { temp: -Infinity, date: null };
        let wettest = { chance: -1, date: null };

        for (let i = 0; i < days; i++) {
          const date = forecast.daily.time[i];
          const maxTemp = forecast.daily.temperature_2m_max[i];
          const minTemp = forecast.daily.temperature_2m_min[i];
          const code = (forecast.daily.weather_code || forecast.daily.weathercode)[i];
          const rainChance = forecast.daily.precipitation_probability_max?.[i] ?? 0;
          const wind = forecast.daily.wind_speed_10m_max?.[i] ?? 0;
          const condition = weatherCodes[code] || 'Unknown';

          if (Number(maxTemp) > warmest.temp) warmest = { temp: Number(maxTemp), date };
          if (Number(rainChance) > wettest.chance) wettest = { chance: Number(rainChance), date };

          fields.push({
            name: `${weatherIcon(code)} ${formatDate(date)} ${tempBar(minTemp, maxTemp)}`,
            value:
              `**${condition}**\n` +
              `🌡️ **${minTemp}°C** low • **${maxTemp}°C** high\n` +
              `🌧️ Rain: **${rainChance}%** • 💨 Wind: **${wind} km/h**`,
            inline: false
          });
        }

        const summary = [
          `📍 **${name}, ${country}**`,
          `📅 **${days}-day forecast**`,
          warmest.date ? `🔥 Warmest: **${formatDate(warmest.date)}** at **${warmest.temp}°C**` : null,
          wettest.date ? `🌧️ Wettest: **${formatDate(wettest.date)}** at **${wettest.chance}%**` : null,
        ].filter(Boolean).join('\n');

        const embed = (await getUserEmbed(interaction.user.id, 'Weather Forecast'))
          .setTitle(await translateText(`Forecast for ${name}, ${country}`, lang))
          .setDescription(summary)
          .addFields(fields)
          .setFooter({ text: 'Powered by Open-Meteo • Local timezone' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      const weatherRes = await fetch(`http://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
      const current = await weatherRes.json();
      if (!current.current_weather) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(await translateText('Weather data is unavailable.', lang));
        return interaction.editReply({ embeds: [embed] });
      }

      const temp = current.current_weather.temperature;
      const wind = current.current_weather.windspeed;
      const title = await translateText('Weather in', lang);
      const embed = (await getUserEmbed(interaction.user.id, 'Weather'))
        .setTitle(`${title} ${name}, ${country}`)
        .addFields(
          { name: 'Temperature', value: `${temp} C`, inline: true },
          { name: 'Wind Speed', value: `${wind} m/s`, inline: true },
        );

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Weather command error:', error);
      const errorText = subcommand === 'forecast'
        ? 'Could not fetch the weather forecast.'
        : 'Could not fetch the weather.';
      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(await translateText(errorText, lang));
      return interaction.editReply({ embeds: [embed] });
    }
  }
};





