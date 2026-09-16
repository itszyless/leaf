const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const settingsPath = path.join(__dirname, '../data/rank-settings.json');

function loadSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function saveSettings(data) {
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranksettings')
    .setDescription('Adjust your personal rank display settings')
    // === Card ===
    .addSubcommand(sub =>
      sub.setName('card')
        .setDescription('Enable or disable your rank card')
        .addStringOption(opt =>
          opt.setName('mode')
            .setDescription('Enable or disable')
            .setRequired(true)
            .addChoices(
              { name: 'On (Default)', value: 'on' },
              { name: 'Off', value: 'off' }
            )
        )
    )
    // === Background ===
    .addSubcommand(sub =>
      sub.setName('background')
        .setDescription('Set or reset your background image')
        .addStringOption(opt =>
          opt.setName('url')
            .setDescription('Image URL or "default" to reset')
            .setRequired(true)
        )
    )
    // === Rank visibility ===
    .addSubcommand(sub =>
      sub.setName('visibility')
        .setDescription('Control who can view your rank')
        .addStringOption(opt =>
          opt.setName('mode')
            .setDescription('Who can see your rank card')
            .setRequired(true)
            .addChoices(
              { name: 'Everyone', value: 'everyone' },
              { name: 'Only Me', value: 'private' }
            )
        )
    )
    // === Show XP ===
    .addSubcommand(sub =>
      sub.setName('xpdisplay')
        .setDescription('Show or hide XP numbers on your rank card')
        .addStringOption(opt =>
          opt.setName('mode')
            .setDescription('Toggle XP display')
            .setRequired(true)
            .addChoices(
              { name: 'Show XP (Default)', value: 'on' },
              { name: 'Hide XP', value: 'off' }
            )
        )
    )
    
    // === Show LEVEL ===
    .addSubcommand(sub =>
      sub.setName('leveldisplay')
        .setDescription('Show or hide level on your rank card')
        .addStringOption(opt =>
          opt.setName('mode')
            .setDescription('Toggle LEVEL display')
            .setRequired(true)
            .addChoices(
              { name: 'Show Level (Default)', value: 'on' },
              { name: 'Hide Level', value: 'off' }
            )
        )
    ),

  category: 'Settings',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const settings = loadSettings();
    if (!settings[userId]) settings[userId] = { card: true, background: null, visibility: 'everyone', showXP: true, showLevel: true };

    let embed = (await getUserEmbed(interaction.user.id, 'Rank Settings'));

    // === CARD ===
    if (sub === 'card') {
      const mode = interaction.options.getString('mode');
      settings[userId].card = mode === 'on';
      embed.setTitle(await translateText('Card Visibility Updated', lang))
        .setDescription(`✅ ${await translateText(mode === 'on'
          ? 'Your rank card has been enabled.'
          : 'Your rank card has been disabled.', lang)}`);
    }

    // === BACKGROUND ===
    if (sub === 'background') {
      const url = interaction.options.getString('url').trim().toLowerCase();
      if (url === 'default') {
        settings[userId].background = null;
        embed.setTitle(await translateText('Background Updated', lang))
          .setDescription(`✅ ${await translateText('Your rank card background was reset to default.', lang)}`);
      } else if (/^https?:\/\/.+\.(jpg|jpeg|png|gif)$/i.test(url)) {
        settings[userId].background = url;
        embed.setTitle(await translateText('Background Updated', lang))
          .setDescription(`✅ ${await translateText('Your custom background has been set.', lang)}`);
      } else {
        const error = await translateText('Please provide a valid image URL ending in .jpg, .png, etc. or use "default".', lang);
        const errEmbed = (await getUserEmbed(interaction.user.id, null, 'error')).setDescription(error);
        return interaction.editReply({ embeds: [errEmbed] });
      }
    }

    // === VISIBILITY ===
    if (sub === 'visibility') {
      const mode = interaction.options.getString('mode');
      settings[userId].visibility = mode;
      const msg = mode === 'everyone'
        ? 'Your rank is now visible to everyone.'
        : 'Your rank is now private. Admins can still view it.';
      embed.setTitle(await translateText('Rank Visibility Updated', lang))
        .setDescription(`✅ ${await translateText(msg, lang)}`);
    }

    // === XP DISPLAY ===
    if (sub === 'xpdisplay') {
      const mode = interaction.options.getString('mode');
      settings[userId].showXP = mode === 'on';
      embed.setTitle(await translateText('XP Display Updated', lang))
        .setDescription(`✅ ${await translateText(mode === 'on'
          ? 'XP numbers will now be shown on your rank.'
          : 'XP numbers will now be hidden from your rank.', lang)}`);
    }

    // === LEVEL DISPLAY ===
    if (sub === 'leveldisplay') {
      const mode = interaction.options.getString('mode');
      settings[userId].showLevel = mode === 'on';
      embed.setTitle(await translateText('Level Display Updated', lang))
        .setDescription(`✅ ${await translateText(mode === 'on'
          ? 'Level will now be shown on your rank.'
          : 'Level will now be hidden from your rank.', lang)}`);
    }

    saveSettings(settings);
    await interaction.editReply({ embeds: [embed] });
  }
};
