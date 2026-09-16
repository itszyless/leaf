const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('access')
    .setDescription('Buy or verify Plus access')
    .addSubcommand(sub => sub.setName('plus').setDescription('Open the leaf Plus purchase menu')),
  category: 'Utility',

  async execute(interaction) {
    const plus = interaction.client.commands.get('plus');
    if (!plus || typeof plus.execute !== 'function') {
      return interaction.reply({ content: 'Use `/plus buy` to unlock leaf Plus.', ephemeral: true });
    }

    const original = interaction.options;
    interaction.options = new Proxy(original, {
      get(target, prop) {
        if (prop === 'getSubcommand') return () => 'buy';
        return Reflect.get(target, prop);
      },
    });

    try {
      return plus.execute(interaction);
    } finally {
      interaction.options = original;
    }
  },
};
