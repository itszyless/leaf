const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const palette = require('../utils/imagePalette');
const plusAccess = require('../utils/plusAccess');
const embedUtils = require('../utils/getUserEmbed');

module.exports = {
  category: 'Image',
  data: new SlashCommandBuilder().setName('image').setDescription('Image tools')
    .addSubcommand(sub => sub.setName('palette')
      .setDescription('Extract dominant HEX colours: up to 15 free / 30 Plus, five per page')
      .addAttachmentOption(option => option.setName('image').setDescription('PNG, JPEG, WebP, GIF or AVIF; up to 10 MB').setRequired(true))),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('image', true);
    const plus = plusAccess.isPlusActive(interaction.user.id);
    let colors, animated, swatches, pages;
    try {
      ({ colors, animated } = await palette.paletteFromBuffer(await palette.downloadImage(attachment), palette.paletteLimit(plus)));
      pages = palette.colorPages(colors);
      swatches = await Promise.all(pages.map(palette.swatchBuffer));
    } catch (error) {
      const embed = await embedUtils.getUserEmbed(interaction.user.id, 'Image Palette', true);
      embed.setDescription(error.message === 'The operation was aborted due to timeout'
        ? 'The image download timed out. Please try again.' : error.message);
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
    const baseEmbed = await embedUtils.getUserEmbed(interaction.user.id, 'Image Palette');
    const prefix = `palette:${interaction.id}:`;
    let page = 0, expired = false;
    const components = () => [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(prefix + 'previous').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(expired || page === 0),
      new ButtonBuilder().setCustomId(prefix + 'next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(expired || page === pages.length - 1),
    )];
    const render = () => {
      const embed = EmbedBuilder.from(baseEmbed).setTitle('Image palette')
        .setThumbnail(attachment.url)
        .setColor(parseInt(colors[0].hex.slice(1), 16))
        .setDescription(`**${colors.length} dominant colours · ${plus ? 'Plus: up to 30' : 'Free: up to 15'}**\n` +
          'Similar shades are combined. Percentages estimate the visible image area.' +
          (animated ? '\nAnimated image: colours from the first frame.' : ''))
        .setFields(pages[page].map((color, index) => ({
          name: `Colour ${page * 5 + index + 1}`,
          value: `\`${color.hex}\` · ${color.percentage.toFixed(1)}%`, inline: true,
        })))
        .setImage(`attachment://palette-${page + 1}.png`)
        .setFooter({ text: `Page ${page + 1}/${pages.length} · Five colours per page · Buttons expire after 5 minutes` });
      return { embeds: [embed], files: [new AttachmentBuilder(swatches[page], { name: `palette-${page + 1}.png` })],
        attachments: [], components: pages.length > 1 ? components() : [], allowedMentions: { parse: [] } };
    };
    const message = await interaction.editReply(render());
    if (pages.length === 1) return message;
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button,
      filter: button => [prefix + 'previous', prefix + 'next'].includes(button.customId), time: 300_000 });
    let queue = Promise.resolve();
    collector.on('collect', button => {
      if (button.user.id !== interaction.user.id) {
        void button.reply({ content: 'This palette belongs to someone else. Run /image palette with your own image.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      // Acknowledge immediately, then serialize edits so fast clicks stay in order.
      const acknowledged = button.deferUpdate().catch(() => null);
      queue = queue.then(async () => {
        await acknowledged;
        if (expired) return;
        page = Math.max(0, Math.min(pages.length - 1, page + (button.customId.endsWith(':next') ? 1 : -1)));
        await interaction.editReply(render());
      }).catch(() => {});
    });
    collector.on('end', () => {
      expired = true;
      queue = queue.then(() => interaction.editReply({ components: components() })).catch(() => {});
    });
    return message;
  },
};
