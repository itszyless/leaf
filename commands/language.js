const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { setUserLanguage, getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const config = require('../config.json');
const path = require('path');
const fs = require('fs');

const { getUserEmbed } = require('../utils/getUserEmbed');

const supportedLanguages = [
  { name: 'English (Fastest)', value: 'en' },
  { name: 'German', value: 'de' },
  { name: 'Spanish', value: 'es' },
  { name: 'French', value: 'fr' },
  { name: 'Italian', value: 'it' },
  { name: 'Dutch', value: 'nl' },
  { name: 'Portuguese', value: 'pt' },
  { name: 'Russian', value: 'ru' },
  { name: 'Turkish', value: 'tr' },
  { name: 'Japanese', value: 'ja' },
  { name: 'Korean', value: 'ko' },
  { name: 'Chinese', value: 'zh' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Set your preferred language')
    .addStringOption(option =>
      option.setName('lang')
        .setDescription('Choose your language')
        .setRequired(true)
        .addChoices(...supportedLanguages)
    )
    .setDMPermission(true),
  category: 'Settings',

  async execute(interaction) {
    const userId = interaction.user.id;
    const lang = interaction.options.getString('lang')?.toLowerCase();

    const currentLang = getUserLanguage(userId)?.toLowerCase() || 'en';

    // Warning message to add if not English
    const warningMsg = '\n\n⚠️ Language can be wrong (automatic translated)';

    if (lang === currentLang) {
      let description = await translateText(`Your language is already set to **${lang.toUpperCase()}**.`, currentLang);
      if (currentLang !== 'en') description += warningMsg;

      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(description)

      return interaction.ephemeralReply({ embeds: [embed] });
    }

    setUserLanguage(userId, lang);
    const updatedLang = getUserLanguage(userId) || 'en';

    let description = await translateText(`Your language has been set to **${lang.toUpperCase()}**.`, updatedLang);
    if (updatedLang !== 'en') description += warningMsg;

    const title = await translateText('Language Updated', updatedLang);

    const embed = (await getUserEmbed(interaction.user.id, 'Language'))
      .setTitle(title)
      .setDescription(description)

    await interaction.ephemeralReply({ embeds: [embed] });
  }
};
