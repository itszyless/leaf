const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText, getTranslated } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Translate')
    .setType(ApplicationCommandType.Message),

  category: 'Utils',

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';

    const message = interaction.targetMessage;
    const original = message.content?.trim();

    if (!original) {
      const title = await translateText('Error', userLang);
      const desc = await translateText('This message is empty or unsupported.', userLang);

      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(desc)

      return interaction.ephemeralReply({ embeds: [embed] });
    }

    try {

      const translated = await getTranslated(original, userLang);
      const title = await translateText('Translation Tool', userLang);
      const from = await translateText('Text', userLang);
      const to = await translateText('Translated', userLang);

      const embed = (await getUserEmbed(interaction.user.id, 'Translation Tool'))
        .setDescription(`**${from}:** ${original}\n**${to}:** ${translated}`)

      return interaction.ephemeralReply({ embeds: [embed] });

    } catch (err) {
      //console.error(err);
      const msg = await translateText('Something went wrong while translating this message.', userLang);

      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(msg)

      return interaction.ephemeralReply({ embeds: [embed] });
    }
  }
};
