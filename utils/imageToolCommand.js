const { AttachmentBuilder } = require('discord.js');
const palette = require('./imagePalette');
const imageTools = require('./imageTools');
const plusAccess = require('./plusAccess');
const embedUtils = require('./getUserEmbed');
const active = new Set();
async function execute(interaction, name) {
  const user = interaction.user.id;
  if (active.has(user) || active.size >= 2) return interaction.editReply({ content: 'Image tools are busy. Please wait for the current images to finish and try again.', allowedMentions: { parse: [] } });
  active.add(user);
  try {
    const plus = plusAccess.isPlusActive(user), options = {}, attachments = [];
    for (const key of ['preset', 'position', 'format', 'colour', 'shadows', 'highlights', 'colours', 'caption', 'output', 'language', 'regions', 'mode']) options[key] = interaction.options.getString(key) ?? undefined;
    for (const key of ['width', 'height', 'columns', 'spacing', 'quality', 'border', 'strength']) options[key] = interaction.options.getInteger(key) ?? undefined;
    options['keep-aspect'] = interaction.options.getBoolean('keep-aspect') ?? undefined;
    if (name === 'collage') { for (let i = 1; i <= 9; i++) { const attachment = interaction.options.getAttachment(`image${i}`); if (attachment) attachments.push(attachment); } }
    else { attachments.push(interaction.options.getAttachment('image', true)); if (name === 'compare') attachments.push(interaction.options.getAttachment('image2', true)); }
    if (attachments.length > imageTools.limits(plus).images) throw new Error('Free collages support 4 images; Plus supports 9.');
    const buffers = []; for (const attachment of attachments) buffers.push(await palette.downloadImage(attachment));
    const result = await imageTools.processImage(name, buffers, options, plus);
    if (result.buffer.length > Math.min(interaction.attachmentSizeLimit || 10 * 1024 * 1024, 10 * 1024 * 1024)) throw new Error('The result exceeds the upload limit. Try a smaller image or fewer collage images.');
    const filename = `leaf-${name}.${result.extension}`;
    const embed = await embedUtils.getUserEmbed(user, `Image · ${name}`);
    embed.setDescription(result.note).setThumbnail(null);
    if (result.extension !== 'txt') embed.setImage(`attachment://${filename}`);
    return await interaction.editReply({ embeds: [embed], files: [new AttachmentBuilder(result.buffer, { name: filename })], attachments: [], allowedMentions: { parse: [] } });
  } catch (error) {
    const embed = await embedUtils.getUserEmbed(user, 'Image tool', true);
    // Native decoders can include paths/internal state in their messages.
    const message = error.message || '';
    embed.setDescription(/^(Use |Free |Your |Dimensions |Keep |Regions |Each |English |No readable |OCR timed |The result |Attach |Please attach |Invalid attachment |Could not download |Images must |Background model |Unexpected background |Unsupported OCR)/.test(message) ? message : 'Could not process that image. Try a smaller, valid PNG, JPEG or WebP attachment.');
    return await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  } finally { active.delete(user); }
}
module.exports = { execute };
