const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  WebhookClient
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const openPath = path.join(__dirname, '../data/openSupports.json');
if (!fs.existsSync(openPath)) fs.writeFileSync(openPath, '{}', 'utf8');

function loadOpen() {
  return JSON.parse(fs.readFileSync(openPath, 'utf8'));
}
function saveOpen(data) {
  fs.writeFileSync(openPath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Report bugs, get support or join our support server.'),
  category: 'Utility',

  async execute(interaction) {
    const userId = interaction.user.id;
    const lang = (await getUserLanguage(userId)) || 'en';
    const open = loadOpen();
    const hasTicket = !!open[userId];

    const embed = await getUserEmbed(userId, 'Support');
    embed
      .setTitle(await translateText('Support Center', lang))
      .setDescription(
        [
          `**${await translateText('Need help or found a bug?', lang)}**`,
          await translateText('Our team is here to help you!', lang),
          '',
          `> Discord: ${config.SupportServer}`,
          `> Email: ${config.SupportMail}`,
          '',
          await translateText('Use the buttons below to contact us or join the community.', lang)
        ].join('\n')
      )
      .setFooter({ text: await translateText('We usually respond within 24 hours.', lang) });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(await translateText('Join Support Server', lang))
        .setStyle(ButtonStyle.Link)
        .setURL(config.SupportServer),
      new ButtonBuilder()
        .setCustomId('show_email')
        .setLabel(await translateText('Show Support Email', lang))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('contact_support')
        .setLabel(await translateText('Contact Support', lang))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(hasTicket)
    );

    const msg = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

    collector.on('collect', async i => {
      if (i.user.id !== userId)
        return i.reply({ ephemeral: true, content: await translateText('Only the command user can use this button.', lang) });

      if (i.customId === 'show_email') {
        return i.reply({
          ephemeral: true,
          content: `?? ${await translateText('Copy Mail:', lang)}\n\`\`\`${config.SupportMail}\`\`\``
        });
      }

      // ?? Contact Support
      if (i.customId === 'contact_support') {
        if (open[userId]) {
          return i.reply({
            ephemeral: true,
            content: await translateText('You already have an active support request. Please wait until it is resolved.', lang)
          });
        }

        const modal = new ModalBuilder()
          .setCustomId('support_modal')
          .setTitle(await translateText('Support Request', lang));

        const issue = new TextInputBuilder()
          .setCustomId('issue')
          .setLabel(await translateText('What problem are you experiencing?', lang))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256);

        const details = new TextInputBuilder()
          .setCustomId('details')
          .setLabel(await translateText('Tell us more (device, which command, etc.)', lang))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1300);

        modal.addComponents(
          new ActionRowBuilder().addComponents(issue),
          new ActionRowBuilder().addComponents(details)
        );
        await i.showModal(modal);

        const filter = m => m.customId === 'support_modal' && m.user.id === userId;
        i.client.once('interactionCreate', async modalInt => {
          if (!modalInt.isModalSubmit() || modalInt.customId !== 'support_modal') return;
          if (open[userId]) {
            return modalInt.reply({
              ephemeral: true,
              content: await translateText('You already submitted a request. Please wait until it is resolved.', lang)
            });
          }

          const issueText = modalInt.fields.getTextInputValue('issue');
          const detailsText = modalInt.fields.getTextInputValue('details');

          // Confirm to user
          const confirm = await getUserEmbed(userId, 'Support');
          confirm
            .setTitle(await translateText('Support Request Sent', lang))
            .setDescription(await translateText('Your message has been sent to our support team. We will contact you if needed.', lang));
          await modalInt.reply({ embeds: [confirm], ephemeral: true });

          // ?? Send to webhook
          const webhook = new WebhookClient({ url: config.Webhook_Support });
          const reportEmbed = await getUserEmbed(userId, null, 'error');
            reportEmbed.setTitle('?? New Support Request');
            reportEmbed.setDescription(
              [
                `## **User:** <@${modalInt.user.id}> (${modalInt.user.id})`,
                '',
                '### ?? Ticket Details',
                `**Issue:** ${issueText}`,
                '',
                `**Details:**\n${detailsText}`,
                '',
                '### ??? Staff Actions',
                'Use (resolved):',
                '```',
                `/staff support action:resolve user:${modalInt.user.id}`,
                '```',
                'Use (fixing):',
                '```',
                `/staff support action:fixing user:${modalInt.user.id}`,
                '```',
                'Use (custom message):',
                '```',
                `/staff support action:message user:${modalInt.user.id} message:your message`,
                '```',
                'Use (delete report):',
                '```',
                `/staff support action:delete user:${modalInt.user.id}`,
                '```'
              ].join('\n')
            );

          const sent = await webhook.send({ embeds: [reportEmbed] }).catch(() => {});

          // Save open ticket
          open[userId] = {
            id: `${Date.now()}`,
            userId,
            issue: issueText,
            details: detailsText,
            messageId: sent?.id || null,
            timestamp: Date.now()
          };
          saveOpen(open);

          // Disable contact button locally
          const updatedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel(await translateText('Join Support Server', lang))
              .setStyle(ButtonStyle.Link)
              .setURL(config.SupportServer),
            new ButtonBuilder()
              .setCustomId('show_email')
              .setLabel(await translateText('Show Support Email', lang))
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('contact_support')
              .setLabel(await translateText('Contact Support', lang))
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true)
          );
          await msg.edit({ components: [updatedRow] }).catch(() => {});
        });
      }
    });
  }
};

