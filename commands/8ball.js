const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText, getTranslated } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

const responses = [
  'Yes.', 'No.', 'Definitely.', 'Absolutely not.', 'Maybe.', 'Ask again later.',
  'I have no idea.', 'Without a doubt.', 'My sources say no.', 'Very likely.',
  'Better not tell you now.', 'Concentrate and ask again.'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question')
        .setRequired(true)
    )
    .setDMPermission(true),
  category: 'Fun',

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id);
    const question = interaction.options.getString('question');
    const randomAnswer = responses[Math.floor(Math.random() * responses.length)];

    // Translate fixed parts + random answer + question
    const [title, questionLabel, answerLabel, translatedAnswer, translatedQuestion] = await Promise.all([
      translateText('🎱 Magic 8-Ball', userLang),
      translateText('Question:', userLang),
      translateText('Answer:', userLang),
      getTranslated(randomAnswer, userLang),
      getTranslated(question, userLang)
    ]);

    const embed = (await getUserEmbed(interaction.user.id, '8ball'))
    embed.setTitle(title)
    embed.setDescription(`**${questionLabel}** ${translatedQuestion}\n(Original: \`${question}\`)\n**${answerLabel}** ${translatedAnswer}`)

    await interaction.ephemeralReply({ embeds: [embed] });
  },
};