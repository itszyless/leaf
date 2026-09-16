const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const math = require('mathjs');
const path = require('path');
const fs = require('fs');

const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('math')
    .setDescription('Evaluate a math expression')
    .addStringOption(option =>
      option.setName('expression')
        .setDescription('e.g. 5 * (4 + 2)')
        .setRequired(true)
    ),
  category: 'Utility',

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';
    const input = interaction.options.getString('expression');

    try {
      const result = math.evaluate(input);
      const title = await translateText('Math Result', userLang);
      const expr = await translateText('Expression', userLang);
      const res = await translateText('Result', userLang);

      const embed = (await getUserEmbed(interaction.user.id, 'Math'))
        .setTitle(`?? ${title}`)
        .addFields(
          { name: expr, value: `\`${input}\`` },
          { name: res, value: `\`${result}\`` }
        )

      interaction.editReply({ embeds: [embed] });

    } catch (err) {
      const message = await translateText('Invalid math expression.', userLang);

      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(message)

      interaction.editReply({ embeds: [embed] });
    }
  }
};

