const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { translateText, getTranslated } = require('../utils/translator');
const { getUserLanguage } = require('../utils/langStorage');
const fs = require('fs');
const path = require('path');

const { getUserEmbed } = require('../utils/getUserEmbed');

const nerdFactsPath = path.join(__dirname, '../data/nerdfacts.json');

function getRandomFact() {
  try {
    const facts = JSON.parse(fs.readFileSync(nerdFactsPath, 'utf8'));
    return facts[Math.floor(Math.random() * facts.length)];
  } catch {
    return 'Knows every keyboard shortcut, including the ones that don’t exist.';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nerdrate')
    .setDescription('See how much of a nerd someone is')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check')
        .setRequired(false)),
  category: 'Plus',
  hidden: true,

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const lang = getUserLanguage(interaction.user.id) || 'en';

    const percent = Math.floor(Math.random() * 101);
    const factText = getRandomFact();
    const p1 = await translateText('is', lang);
    const p2 = await translateText('nerd', lang);
    const description = `${user.username} ${p1} ${percent}% ${p2}.`;
    const detail = await getTranslated(factText, lang);
    const title = await translateText('🤓 Nerd Rate', lang);

    const embed = (await getUserEmbed(interaction.user.id, 'Nerd Rate'))
      .setTitle(title)
      .setDescription(`${description}\n${detail}`)

    await interaction.editReply({ embeds: [embed] });
  }
};
