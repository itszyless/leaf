const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

function seededPercent(seed) {
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 101;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('howautistic')
    .setDescription('Check how autistic someone is')
    .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(false)),
  hidden: true,
  category: 'Fun',
  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const percent = seededPercent(`${target.id}:autistic:${new Date().toISOString().slice(0, 10)}`);
    const embed = await getUserEmbed(interaction.user.id, 'How Autistic');
    embed.setDescription(`**${target.username}** is \`${percent}%\` autistic today.`);
    return interaction.editReply({ embeds: [embed] });
  },
};
