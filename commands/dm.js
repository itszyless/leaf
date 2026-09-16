const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');

// Load Plus Users and DM Settings
const plusUsersPath = './data/plusUsers.json';
const dmSettingsPath = './data/DMSettings.json';

function getPlusUsers() {
  return JSON.parse(fs.readFileSync(plusUsersPath, 'utf8'));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Make the bot DM a user')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Send as normal message or embed')
        .setRequired(true)
        .addChoices(
          { name: 'Normal', value: 'normal' },
          { name: 'Embed', value: 'embed' }
        )
    )
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Who the bot should DM')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('text')
        .setDescription('Text to send')
        .setRequired(true)
        .setMaxLength(300)
    ),
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const type = interaction.options.getString('type');
    let text = interaction.options.getString('text');
    const user = interaction.options.getUser('user');

    const dmUserLang = getUserLanguage(user.id) || 'en';

    const dmSettings = JSON.parse(fs.readFileSync(dmSettingsPath, 'utf8'));

    // DM Settings check
    if (dmSettings[user.id] === false) {
      const errorMsg = await translateText('This user has turned off DMs via bot settings.', lang);
      const errorEmbed = await getUserEmbed(interaction.user.id, null, 'error');
      errorEmbed.setDescription(errorMsg);
      return interaction.editReply({ embeds: [errorEmbed] });
    }

    // Anonymity check
    const plusUsers = getPlusUsers();
    const isPlus = plusUsers[interaction.user.id] === true;
    const senderTag = `${interaction.user.username}`;

    try {
      let sendfromText = await translateText('Sent from', dmUserLang);
      if (type === 'embed') {
        const title = await translateText('New Message', dmUserLang);
        const embed = (await getUserEmbed(interaction.user.id, 'DM (Embed)'))
          .setTitle(`📩 ${title}`)
          

        if (!isPlus) {
          embed.setDescription( text +  `\n\n> ${sendfromText} **${senderTag}**` );
        } else {
          embed.setDescription(text);
        }

        await user.send({ embeds: [embed] });
      } else {
        if (!isPlus) {
          text += `\n\n> ${sendfromText} **${senderTag}**`;
        }
        await user.send({ content: text });
      }

      const doneMsg = await translateText('Message sent successfully!', lang);
      const donetit = await translateText('Success', lang);
      const successEmbed = await getUserEmbed(interaction.user.id, 'DM Success');
      successEmbed.setTitle('✅ ' + donetit).setDescription(doneMsg);
      await interaction.editReply({ embeds: [successEmbed] });

    } catch (err) {
      const failMsg = await translateText('Could not send the message. The user might have DMs off.', lang);
      const errorEmbed = await getUserEmbed(interaction.user.id, null, 'error');
      errorEmbed.setDescription(failMsg);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};
