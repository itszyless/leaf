const { SlashCommandBuilder } = require('discord.js');

const animatedCommands = {
  binary: require('./binary'),
  explode: require('./explode'),
  fallingtext: require('./fallingtext'),
  glitchtext: require('./glitchtext'),
  hearttype: require('./hearttype'),
  morse: require('./morse'),
  scrolltext: require('./scrolltext'),
  typewriter: require('./typewriter'),
  wave: require('./wave'),
};

function addTextSubcommand(builder, name, description, maxLength = 50) {
  return builder.addSubcommand(sub =>
    sub
      .setName(name)
      .setDescription(description)
      .addStringOption(opt =>
        opt
          .setName('text')
          .setDescription('Text to animate')
          .setRequired(true)
          .setMaxLength(maxLength)
      )
  );
}

let data = new SlashCommandBuilder()
  .setName('animate')
  .setDescription('Animated text tools in one command.');

data = addTextSubcommand(data, 'binary', 'Convert text to binary with animation.', 40);
data = addTextSubcommand(data, 'explode', 'Make your text explode letter by letter.', 40);
data = data.addSubcommand(sub =>
  sub
    .setName('fallingtext')
    .setDescription('Simulate falling text animation.')
    .addStringOption(opt =>
      opt
        .setName('text')
        .setDescription('Text to animate')
        .setRequired(true)
        .setMaxLength(50)
    )
    .addStringOption(opt =>
      opt
        .setName('mode')
        .setDescription('Falling direction')
        .addChoices(
          { name: 'Normal', value: 'normal' },
          { name: 'Reversed', value: 'reversed' }
        )
        .setRequired(false)
    )
);
data = addTextSubcommand(data, 'glitchtext', 'Animate your message with a glitch effect.', 40);
data = addTextSubcommand(data, 'hearttype', 'Type your message letter by letter with hearts.', 35);
data = addTextSubcommand(data, 'morse', 'Convert text to Morse code with animation.', 50);
data = addTextSubcommand(data, 'scrolltext', 'Scroll text across the message.', 40);
data = addTextSubcommand(data, 'typewriter', 'Simulate typing animation.', 25);
data = addTextSubcommand(data, 'wave', 'Animate text with a wave effect.', 40);

module.exports = {
  data,
  category: 'Animated',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const command = animatedCommands[subcommand];
    if (!command) {
      return interaction.editReply({ content: 'Unknown animation.' });
    }

    return command.execute(interaction);
  }
};
