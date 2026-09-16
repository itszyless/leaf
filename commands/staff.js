const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getUserEmbed } = require('../utils/getUserEmbed');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const openPath = path.join(__dirname, '../data/openSupports.json');
function loadOpen() {
  if (!fs.existsSync(openPath)) fs.writeFileSync(openPath, '{}');
  return JSON.parse(fs.readFileSync(openPath, 'utf8'));
}
function saveOpen(data) {
  fs.writeFileSync(openPath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Staff management commands.')
    .addSubcommand(sub =>
      sub
        .setName('support')
        .setDescription('Manage support requests.')
        .addStringOption(o =>
          o
            .setName('action')
            .setDescription('What to do with the report.')
            .setRequired(true)
            .addChoices(
              { name: 'resolve', value: 'resolve' },
              { name: 'fixing', value: 'fixing' },
              { name: 'message', value: 'message' },
              { name: 'delete', value: 'delete' }
            )
        )
        .addUserOption(o =>
          o.setName('user').setDescription('The user who sent the report.').setRequired(true)
        )
        .addStringOption(o =>
          o
            .setName('message')
            .setDescription('Custom message for the user (only for "message" action).')
            .setRequired(false)
        )
    ),
  category: 'Admin',
  hidden: true,

  async execute(interaction) {
    const action = interaction.options.getString('action');
    const user = interaction.options.getUser('user');
    const customMsg = interaction.options.getString('message') || null;

    const open = loadOpen();
    const ticket = open[user.id];

    const staffLang = (await getUserLanguage(interaction.user.id)) || 'en';
    const userLang = (await getUserLanguage(user.id)) || 'en';

    if (!ticket) {
      const embed = await getUserEmbed(interaction.user.id, null, 'error');
      embed.setDescription(await translateText(`No open ticket found for ${user.tag}.`, staffLang));
      return interaction.editReply({ embeds: [embed] });
    }

    // helper: send DM embed safely
    const sendDMEmbed = async (title, description) => {
      try {
        const dmEmbed = await getUserEmbed(user.id, 'Support');
        dmEmbed.setTitle(title).setDescription(description);
        await user.send({ embeds: [dmEmbed] });
        return true;
      } catch {
        return false;
      }
    };

    // ===== RESOLVE =====
    if (action === 'resolve') {
      const dmTitle = await translateText('Support Update', userLang);
      const dmDesc =
        `${await translateText('The bug you reported', userLang)} ("${ticket.issue}") ` +
        `${await translateText('has been resolved. Thank you for reporting.', userLang)}`;
      const sent = await sendDMEmbed(dmTitle, dmDesc);

      if (sent) delete open[user.id];
      saveOpen(open);

      const embed = await getUserEmbed(interaction.user.id, 'Support');
      embed.setDescription(
        sent
          ? `✅ ${await translateText('Marked', staffLang)} ${user.tag} ${await translateText('as resolved and notified them.', staffLang)}`
          : `❌ ${await translateText('Marked', staffLang)} ${user.tag} ${await translateText("as resolved, but couldn't DM them.", staffLang)}`
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ===== FIXING =====
    if (action === 'fixing') {
      const dmTitle = await translateText('Support Update', userLang);
      const dmDesc =
        `${await translateText('We are currently fixing the bug', userLang)} ("${ticket.issue}"). ` +
        `${await translateText('Thank you for reporting.', userLang)}`;
      const sent = await sendDMEmbed(dmTitle, dmDesc);
      saveOpen(open);

      const embed = await getUserEmbed(interaction.user.id, 'Support');
      embed.setDescription(
        sent
          ? `🔵 ${await translateText('Notified', staffLang)} ${user.tag} ${await translateText('that we are fixing it.', staffLang)}`
          : `❌ ${await translateText("Couldn't DM", staffLang)} ${user.tag}.`
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ===== CUSTOM MESSAGE =====
    if (action === 'message') {
      if (!customMsg) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription(await translateText('Please include a message text.', staffLang));
        return interaction.editReply({ embeds: [err] });
      }

      const dmTitle = await translateText('Message from Support Team', userLang);
      const sent = await sendDMEmbed(dmTitle, customMsg);

      const embed = await getUserEmbed(interaction.user.id, 'Support');
      embed.setDescription(
        sent
          ? `📨 ${await translateText('Custom message sent to', staffLang)} ${user.tag}.`
          : `❌ ${await translateText("Couldn't DM", staffLang)} ${user.tag}.`
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ===== DELETE =====
    if (action === 'delete') {
      delete open[user.id];
      saveOpen(open);
      const embed = await getUserEmbed(interaction.user.id, 'Support');
      embed.setDescription(`🗑️ ${await translateText('Deleted support report for', staffLang)} ${user.tag}.`);
      return interaction.editReply({ embeds: [embed] });
    }
  }
};
