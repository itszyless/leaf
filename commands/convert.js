const { SlashCommandBuilder } = require('discord.js');
const noblox = require('../utils/robloxUsers');
const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Convert IDs and usernames')
    .addSubcommand(sub => sub
      .setName('discordid2user')
      .setDescription('Get the Discord user from an ID')
      .addStringOption(opt => opt.setName('user_id').setDescription('Discord user ID').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('discorduser2id')
      .setDescription('Get the Discord ID of a user')
      .addUserOption(opt => opt.setName('user').setDescription('Discord user').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('robloxid2user')
      .setDescription('Get the Roblox username from a user ID')
      .addIntegerOption(opt => opt.setName('user_id').setDescription('Roblox user ID').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('robloxuser2id')
      .setDescription('Get the Roblox user ID from a username')
      .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true).setMaxLength(32))),
  category: 'Utility',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const embed = await getUserEmbed(interaction.user.id, 'Convert');

    if (sub === 'discordid2user') {
      const id = interaction.options.getString('user_id').trim();
      if (!/^\d{15,25}$/.test(id)) {
        embed.setTitle('Invalid Discord ID').setDescription('Please enter a valid Discord snowflake ID.');
        return interaction.editReply({ embeds: [embed] });
      }
      const user = await interaction.client.users.fetch(id).catch(() => null);
      embed.setTitle('Discord ID to User').setDescription(user ? `User: ${user}
Username: **${user.username}**
ID: \`${user.id}\`` : 'No user could be fetched for that ID.');
      if (user) embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'discorduser2id') {
      const user = interaction.options.getUser('user');
      embed.setTitle('Discord User to ID').setDescription(`User: ${user}
Username: **${user.username}**
ID: \`${user.id}\``).setThumbnail(user.displayAvatarURL({ size: 256 }));
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'robloxid2user') {
      const id = interaction.options.getInteger('user_id');
      const username = await noblox.getUsernameFromId(id).catch(() => null);
      embed.setTitle('Roblox ID to User').setDescription(username ? `Username: **${username}**
ID: \`${id}\`` : 'No Roblox user found for that ID.');
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'robloxuser2id') {
      const username = interaction.options.getString('username').trim();
      const id = await noblox.getIdFromUsername(username).catch(() => null);
      embed.setTitle('Roblox User to ID').setDescription(id ? `Username: **${username}**
ID: \`${id}\`` : 'No Roblox user found for that username.');
      return interaction.editReply({ embeds: [embed] });
    }
  },
};

