const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Banner')
    .setType(ApplicationCommandType.User),
  category: 'Image',

  async execute(interaction) {
    const target = interaction.targetUser || interaction.user;
    const fetched = await target.fetch(true).catch(() => target);
    const extension = fetched.banner?.startsWith('a_') ? 'gif' : 'png';
    const bannerURL = fetched.bannerURL?.({ size: 2048, extension });

    if (!bannerURL) {
      const err = await getUserEmbed(interaction.user.id, null, 'error');
      err.setDescription('That user does not have a banner, or Discord did not return one.');
      return interaction.editReply({ embeds: [err] });
    }

    const embed = await getUserEmbed(interaction.user.id, 'Banner');
    embed
      .setTitle(`${target.username}'s Banner`)
      .setDescription(`[Open banner](${bannerURL})`)
      .setImage(bannerURL);

    return interaction.editReply({ embeds: [embed] });
  }
};
