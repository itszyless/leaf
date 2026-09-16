const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const lines = {
  rizz: [
    'Are you a keyboard? Because you are exactly my type.',
    'Are you Wi-Fi? Because I am feeling a connection.',
    'Are you a loading screen? Because I could stare at you all day.',
    'You must be made of copper and tellurium, because you are Cu-Te.',
    'Are you a rare drop? Because I have been grinding for you.',
    'Are you a bug fix? Because everything feels better when you show up.',
    'Are you a timestamp? Because you make every moment count.',
    'Are you a playlist? Because you have been stuck in my head.',
    'Are you a critical hit? Because you just changed the whole fight.',
    'Are you a command cooldown? Because I have been waiting just for you.',
    'Are you a perfect embed? Because everything about you is well formatted.',
    'Are you my favorite notification? Because I was hoping it would be you.',
    'Are you a rare username? Because I cannot believe nobody claimed you first.',
  ],
  excuse: [
    'I was going to be productive, but my motivation entered maintenance mode.',
    'My brain opened 47 tabs and then crashed.',
    'I trusted the process. The process left the chat.',
    'I was delayed by a very serious case of “just five more minutes.”',
    'My schedule and my confidence had a disagreement.',
    'I got distracted by thinking about not getting distracted.',
    'The plan was perfect until I had to actually do it.',
    'I was busy emotionally buffering.',
  ],
  insult: [
    'You have the confidence of a software update at 1%.',
    'You bring “are you sure?” energy to every decision.',
    'Your brain has more loading screens than gameplay.',
    'You are proof that patch notes can miss things.',
    'You argue like your source is “trust me.”',
    'Your common sense is still in beta.',
    'You have side quest energy in a main quest conversation.',
    'You are built like an unskippable tutorial.',
    'You have the strategic depth of a coin flip.',
    'Your ideas arrive pre-muted.',
    'You bring expired coupon energy to every plan.',
    'Your confidence has no patch notes and it shows.',
    'You are the reason confirmation dialogs exist.',
  ],
  affirmation: [
    'You are doing better than you think.',
    'Small progress still counts. Keep going.',
    'You can be proud of yourself for trying again.',
    'You do not have to be perfect to be valuable.',
    'One calm step is still a step forward.',
    'You have survived every hard day so far.',
    'You are allowed to take up space.',
    'You are capable of building something good from here.',
  ],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('random')
    .setDescription('Random fun lines')
    .addSubcommand(sub => sub.setName('rizz').setDescription('Get a random rizz line').addUserOption(opt => opt.setName('user').setDescription('User to rizz').setRequired(false)))
    .addSubcommand(sub => sub.setName('excuse').setDescription('Get a random excuse'))
    .addSubcommand(sub => sub.setName('insult').setDescription('Get a random insult'))
    .addSubcommand(sub => sub.setName('affirmation').setDescription('Get a random affirmation')),
  category: 'Fun',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const titles = {
      rizz: 'Rizz',
      excuse: 'Excuse',
      insult: 'Insult',
      affirmation: 'Affirmation',
    };
    const embed = await getUserEmbed(interaction.user.id, titles[sub]);
    const target = sub === 'rizz' ? interaction.options.getUser('user') : null;
    embed.setDescription(`${target ? `${target} ` : ''}${pick(lines[sub])}`);
    return interaction.editReply({ embeds: [embed] });
  }
};


