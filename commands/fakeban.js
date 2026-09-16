const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { translateText, getTranslated } = require('../utils/translator');
const { getUserLanguage } = require('../utils/langStorage');
const fs = require('fs');
const path = require('path');

const { getUserEmbed } = require('../utils/getUserEmbed');

const reasonsPath = path.join(__dirname, '../data/fakebanReasons.json');

function getRandomReason() {
  try {
    const reasons = JSON.parse(fs.readFileSync(reasonsPath, 'utf8'));
    return reasons[Math.floor(Math.random() * reasons.length)];
  } catch {
    return 'No reason. Just vibes.';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fakeban')
    .setDescription('Pretend to ban someone for fun')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to fake ban')
        .setRequired(true)),
  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const lang = getUserLanguage(interaction.user.id) || 'en';

    const title = await translateText('🚫 Banned!', lang);
    const reasonText = getRandomReason().replace('{user}', target.username);
    const reason = await getTranslated(reasonText, lang);

    const embed = (await getUserEmbed(interaction.user.id, 'Fake Ban'))
      .setTitle(title)
      .setDescription(reason)

    await interaction.editReply({ embeds: [embed] });
  }
};