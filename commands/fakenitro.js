const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} = require('discord.js');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fakenitro')
    .setDescription('Generate a fake but realistic Nitro gift'),

  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 300;

    const [giftTitle, giftedText, monthText, expiresText, disclaimerText, claimText] = await Promise.all([
      translateText('You have been gifted a subscription!', lang),
      translateText('You have been gifted Nitro for', lang),
      translateText('1 month', lang),
      translateText('Expires', lang),
      translateText('Disclaimer', lang),
      translateText('Claim', lang),
    ]);

    const nitroEmbed = (await getUserEmbed(interaction.user.id, 'Nitro Gen'))
      .setTitle(giftTitle)
      .setThumbnail('https://cdn.discordapp.com/attachments/1394097537526534316/1400889606844715059/icon_1ef3906b5e11257e85c8db32687889030a86622e57c554c2add481ea6428c5d8.png')
      .setDescription(
        `**${giftedText} **${monthText}**!**\n${expiresText} <t:${expiresAt}:R>\n\n**[${disclaimerText}](<https://discord.com/vanityurl/dotcom/steakpants/flour/flower/index11.html>)**`
      )
      .setAuthor(null)
      .setFooter(null);

    const claimButton = new ButtonBuilder()
      .setLabel(claimText)
      .setCustomId('claim_fake_nitro')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(claimButton);
    const message = await interaction.editReply({ embeds: [nitroEmbed], components: [row], fetchReply: true });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 950,
      max: 1,
    });

    collector.on('collect', async i => {
      const userLang = getUserLanguage(i.user.id) || 'en';
      const prankDesc = await translateText('You have been pranked. This Nitro gift is fake!', userLang);
      const prankEmbed = (await getUserEmbed(i.user.id, null, 'error'))
        .setDescription(prankDesc)
        .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExdHduMjUzbnpwaHJxNGZqd3hhNnFhMTQ2ZW1tdTlnM2F5YzN2Z21pcCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/lgcUUCXgC8mEo/giphy.gif');

      const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(claimButton).setDisabled(true));
      await i.update({ components: [disabledRow] }).catch(() => null);
      await interaction.editReply({ content: `${i.user}`, embeds: [prankEmbed], components: [] }).catch(() => null);
    });

    collector.on('end', async collected => {
      if (collected.size !== 0) return;
      const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(claimButton).setDisabled(true));
      await interaction.editReply({ embeds: [nitroEmbed], components: [disabledRow] }).catch(() => null);
    });
  },
};
