const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getUserLanguage } = require('../utils/langStorage');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const config = require('../config.json');

const nsfwSettingsPath = path.join(__dirname, '../data/nsfw.json');

const { NightAPI } = require('night-api');

function loadNSFWSettings() {
  if (!fs.existsSync(nsfwSettingsPath)) return {};
  return JSON.parse(fs.readFileSync(nsfwSettingsPath, 'utf8'));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nsfw')
    .setDescription('NSFW-style image command')
    .setDMPermission(false)
    .addStringOption(opt =>
      opt
        .setName('category')
        .setDescription('Choose a category')
        .setRequired(true)
        .addChoices(
          { name: 'Anal', value: 'anal' },
          { name: 'Pussy', value: 'pussy' },
          { name: 'Ass', value: 'ass' },
          { name: 'Boobs', value: 'boobs' },
          { name: 'Pgif', value: 'pgif' },
          { name: 'Tentacle', value: 'tentacle' },
          { name: 'Gonewild', value: 'gonewild' },
          { name: 'Hanal', value: 'hanal' },
          { name: 'Hboobs', value: 'hboobs' },
          { name: 'Hentai', value: 'hentai' },
          { name: 'Hkitsune', value: 'hkitsune' },
          { name: 'Hmidriff', value: 'hmidriff' },
          { name: 'Hass', value: 'hass' },
          { name: 'Thigh', value: 'Thigh' },
          { name: 'Yaoi', value: 'yaoi' },
          { name: 'Paizuri', value: 'paizuri' },
          { name: 'Neko', value: 'neko' },
          { name: 'Hthigh', value: 'hthigh' },
          { name: 'Hneko', value: 'hneko' },
          { name: 'Random', value: 'random' }
        ),
    ),

  category: 'Image',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const userId = interaction.user.id;
    const typeC = interaction.options.getString('category');

    const settings = loadNSFWSettings();
    const userSetting = settings[userId] || { enabled: false };

    if (!userSetting.enabled) {
      const e = await getUserEmbed(userId, null, 'error');
      e.setDescription(
        await translateText(
          'NSFW-style commands are disabled for you. Use /nsfwsettings to enable them.',
          lang,
        ),
      );
      return interaction.editReply({ embeds: [e], ephemeral: true });
    }

    const loadingText = await translateText('Fetching an image for you...', lang);
    const embed = await getUserEmbed(userId, 'NSFW');
    embed.setDescription(loadingText);
    await interaction.editReply({ embeds: [embed] });

    try {
      if (!config.Night_API_Key) throw new Error('Night_API_Key is not configured.');
      const api = new NightAPI(config.Night_API_Key);
      // Example – adjust to your actual SFW NightAPI method & categories
      let result;
      if (typeC === 'random') {
        result = await api.nsfw.fetchImage();              // no type => random
      } else {
        result = await api.nsfw.fetchImage(typeC);         // category-based
      }

      let imgUrl;

      // check the structure
      if (result?.content?.url) imgUrl = result.content.url;
      else if (typeof result === 'string') imgUrl = result;
      else imgUrl = null;

      if (!imgUrl) {
        const e = await getUserEmbed(userId, null, 'error');
        e.setDescription(await translateText('Could not fetch a valid image URL from the API.', lang));
        return interaction.editReply({ embeds: [e] });
      }

      // now just use the URL in the embed
      embed.setDescription(await translateText('Here is your image:', lang))
          .setImage(imgUrl);

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('nsfw command error:', err);
      const e = await getUserEmbed(userId, null, 'error');
      e.setDescription(
        await translateText('Failed to fetch an image. Please try again later.', lang),
      );
      return interaction.editReply({ embeds: [e] });
    }
    



  },
};
