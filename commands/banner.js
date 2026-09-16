const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Show a user or server banner.')
    .addSubcommand(sub =>
      sub
        .setName('user')
        .setDescription('Show a user banner.')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to inspect')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('server')
        .setDescription('Show this server banner.')
    ),
  category: 'Image',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'server') {
      const guild = interaction.guild;
      if (!guild) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('Server banners only work inside a server.');
        return interaction.editReply({ embeds: [err] });
      }

      const url = guild.bannerURL({ size: 2048, extension: 'png' });
      if (!url) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('This server does not have a banner.');
        return interaction.editReply({ embeds: [err] });
      }

      const embed = await getUserEmbed(interaction.user.id, 'Banner');
      embed.setTitle(`${guild.name}'s Banner`).setDescription(`[Open banner](${url})`).setImage(url);
      return interaction.editReply({ embeds: [embed] });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const fetched = await target.fetch(true).catch(() => target);
    const url = fetched.bannerURL?.({ size: 2048, extension: fetched.banner?.startsWith('a_') ? 'gif' : 'png' });

    if (!url) {
      const err = await getUserEmbed(interaction.user.id, null, 'error');
      err.setDescription('That user does not have a banner, or Discord did not return one.');
      return interaction.editReply({ embeds: [err] });
    }

    const embed = await getUserEmbed(interaction.user.id, 'Banner');
    embed.setTitle(`${target.username}'s Banner`).setDescription(`[Open banner](${url})`).setImage(url);
    return interaction.editReply({ embeds: [embed] });
  }
};
