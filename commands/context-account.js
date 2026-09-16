const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { showAccount } = require('./account');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Account')
    .setType(ApplicationCommandType.User),
  category: 'Utility',

  async execute(interaction) {
    return showAccount(interaction, interaction.targetUser || interaction.user);
  },
};

