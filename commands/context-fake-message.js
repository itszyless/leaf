const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { normalizeTheme } = require('../utils/fakeMessageRenderer');

function themeOrDark(theme) {
  const key = String(theme || '').trim().toLowerCase();
  if (!key) return 'dark';
  const normalized = normalizeTheme(key);
  return normalized === key ? normalized : 'dark';
}

function buildModal(targetId) {
  return new ModalBuilder()
    .setCustomId(`fake_message:${targetId}`)
    .setTitle('Fake Message')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel('Message text')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(1)
          .setMaxLength(1000)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('theme')
          .setLabel('Theme: dark, ash, onyx, black, light')
          .setStyle(TextInputStyle.Short)
          .setMinLength(4)
          .setMaxLength(5)
          .setPlaceholder('dark')
          .setValue('dark')
          .setRequired(false),
      ),
    );
}

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Fake Message')
    .setType(ApplicationCommandType.User),
  category: 'Media',

  async execute(interaction) {
    const target = interaction.targetUser || interaction.user;
    return interaction.showModal(buildModal(target.id));
  },

  async handleModal(interaction) {
    const targetId = interaction.customId.split(':')[1];
    const user = await interaction.client.users.fetch(targetId).catch(() => interaction.user);
    const text = interaction.fields.getTextInputValue('text');
    const theme = themeOrDark(interaction.fields.getTextInputValue('theme'));
    const generate = interaction.client.commands.get('generate') || require('./generate');
    return generate.sendFakeMessage(interaction, { user, text, theme, appBadge: 'auto' });
  },
};


