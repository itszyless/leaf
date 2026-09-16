const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

function trackAvatarIfAvailable(user) {
  try {
    const avatarCommand = require('./avatar');
    if (typeof avatarCommand.trackAvatar === 'function') avatarCommand.trackAvatar(user);
  } catch {
    // Avatar history is nice to have, but the context menu should still work without it.
  }
}

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Avatar')
    .setType(ApplicationCommandType.User),
  category: 'Image',

  async execute(interaction) {
    const target = interaction.targetUser || interaction.user;
    trackAvatarIfAvailable(target);

    const avatarURL = target.displayAvatarURL({ size: 1024, dynamic: true });
    const embed = await getUserEmbed(interaction.user.id, 'Avatar');
    embed
      .setTitle(`${target.username}'s Avatar`)
      .setDescription(`[Open avatar](${avatarURL})`)
      .setImage(avatarURL);

    return interaction.editReply({ embeds: [embed] });
  }
};
