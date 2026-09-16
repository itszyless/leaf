const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events,
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText, getTranslated } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const { makePermanent } = require('../utils/convertURL');


const layoutsPath = path.join(__dirname, '../data/embedLayouts.json');
const userLayoutsPath = path.join(__dirname, '../data/userLayouts.json');


function loadJSON(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('loadJSON error', file, err);
    return {};
  }
}

// atomic write to reduce corruption risk
function saveJSON(file, data) {
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('saveJSON error', file, err);
  }
}

function recalcUses(layouts, userLayouts) {
  // Reset all counts
  for (const id of Object.keys(layouts)) {
    layouts[id].uses = 0;
  }
  // Count how many users currently reference each layout
  for (const userId of Object.keys(userLayouts)) {
    const layoutId = userLayouts[userId];
    if (layoutId && layouts[layoutId]) {
      layouts[layoutId].uses = (layouts[layoutId].uses || 0) + 1;
    }
  }
}



function normalizeColor(color) {
  if (!color) return null;
  if (typeof color === 'number') {
    return `#${color.toString(16).padStart(6, '0')}`.toUpperCase();
  }
  if (typeof color === 'string') {
    return (color.startsWith('#') ? color : `#${color}`).toUpperCase();
  }
  return null;
}

function stripQueryParams(url) {
  try {
    if (!url) return null;
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url || null;
  }
}

function isImageLink(url) {
  return /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)$/i.test(url || '');
}

// reduce an embed theme to its "shape" for dedupe
function embedCanonical(obj) {
  return {
    color: normalizeColor(obj?.color),
    author: obj?.author?.name || null,
    authorIcon: stripQueryParams(obj?.author?.icon_url || obj?.author?.iconURL || null),
    footer: obj?.footer?.text || null,
    footerIcon: stripQueryParams(obj?.footer?.icon_url || obj?.footer?.iconURL || null),
    thumbnail: stripQueryParams(obj?.thumbnail?.url || null),
  };
}

function embedEquals(a, b) {
  return JSON.stringify(embedCanonical(a)) === JSON.stringify(embedCanonical(b));
}


// used to generate a "stable-ish" hash of layout config
function layoutHash(layoutData) {
  const canon = embedCanonical(layoutData); // now sync
  const json = JSON.stringify(canon);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash) + json.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}


// take an EmbedBuilder and convert to plain layout object we can store
async function getLayoutFromEmbed(embedBuilder) {
  const e = embedBuilder.data || {};
  return {
    color: normalizeColor(e.color),
    author: e.author
      ? {
          name: e.author.name,
          icon_url: await makePermanent(stripQueryParams(e.author.icon_url) || await makePermanent(e.author.iconURL) || null),
        }
      : null,
    footer: e.footer
      ? {
          text: e.footer.text,
          icon_url: await makePermanent(stripQueryParams(e.footer.icon_url) || await makePermanent(e.footer.iconURL) || null),
        }
      : null,
    thumbnail: e.thumbnail
      ? { url: await makePermanent(stripQueryParams(e.thumbnail.url)) }
      : null,
  };
}

// default theme from config.json
async function getDefaultLayout() {
  return {
    color: normalizeColor(config.Embed_Color),
    author: config.Embed_Author_Name
      ? {
          name: config.Embed_Author_Name,
          icon_url: await makePermanent(stripQueryParams(config.Embed_Author_Icon || null)),
        }
      : null,
    footer: config.Embed_Footer
      ? {
          text: config.Embed_Footer,
          icon_url: await makePermanent(stripQueryParams(config.Embed_Footer_Icon || null)),
        }
      : null,
    thumbnail: config.Embed_Thumbnail_Icon
      ? { url: await makePermanent(stripQueryParams(config.Embed_Thumbnail_Icon)) }
      : null,
  };
}

async function isDefaultLayout(layoutData) {
  return embedEquals(layoutData, await getDefaultLayout());
}



// build an EmbedBuilder from a stored layout, falling back to config defaults
async function buildEmbedFromLayout(layout, i18n) {
  const e = new EmbedBuilder()
    .setColor(layout?.color || config.Embed_Color)
    .setTitle(i18n.titleHere || "The Title Is Here.")
    .setDescription(i18n.descHere || "The Description Is Here.");

  if (layout?.author && layout.author.name) {
    e.setAuthor(
      layout.author.icon_url || layout.author.iconURL
        ? { name: layout.author.name, iconURL: await makePermanent(layout.author.icon_url) || await makePermanent(layout.author.iconURL) }
        : { name: layout.author.name }
    );
  } else if (config.Embed_Author_Name) {
    e.setAuthor({
      name: config.Embed_Author_Name,
      iconURL: config.Embed_Author_Icon || null,
    });
  }

  if (layout?.footer && layout.footer.text) {
    e.setFooter(
      layout.footer.icon_url || layout.footer.iconURL
        ? { text: layout.footer.text, iconURL: await makePermanent(layout.footer.icon_url) || await makePermanent(layout.footer.iconURL) }
        : { text: layout.footer.text }
    );
  } else if (config.Embed_Footer) {
    e.setFooter({
      text: config.Embed_Footer,
      iconURL: config.Embed_Footer_Icon || null,
    });
  }

  if (layout?.thumbnail?.url) {
    e.setThumbnail(await makePermanent(layout.thumbnail.url));
  } else if (config.Embed_Thumbnail_Icon) {
    e.setThumbnail(config.Embed_Thumbnail_Icon);
  }

  return e;
}

// always clone to avoid Discord caching stale builder instance
function cloneEmbed(embedBuilder) {
  return EmbedBuilder.from(embedBuilder.data);
}


function buildMainRows(i18n, sid) {
  // put sid on component IDs so two users running /customize at once don't clash
  const withSid = (id) => `${id}:${sid}`;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(withSid('edit_thumbnail'))
      .setLabel(i18n.btnThumbnail)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(withSid('edit_author'))
      .setLabel(i18n.btnAuthor)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(withSid('edit_color'))
      .setLabel(i18n.btnColor)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(withSid('edit_footer'))
      .setLabel(i18n.btnFooter)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(withSid('template_apply'))
      .setLabel(i18n.btnTemplate)
      .setStyle(ButtonStyle.Primary),
  );

const row2 = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(withSid('default_customize')).setLabel(i18n.btnDefault).setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(withSid('reset_customize')).setLabel(i18n.btnReset || 'Reset Theme').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(withSid('cancel_customize')).setLabel(i18n.btnCancel).setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId(withSid('done_customize')).setLabel(i18n.btnDone).setStyle(ButtonStyle.Success),
);


  return [row1, row2];
}

// Build a confirm modal like CANCEL / CONFIRM
function buildConfirmModal(fullId, title, fieldId, placeholderText, requiredValue) {
  return new ModalBuilder()
    .setCustomId(fullId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(fieldId)
          .setLabel(placeholderText)
          .setPlaceholder(requiredValue)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(requiredValue.length)
          .setMaxLength(requiredValue.length)
      )
    );
}

// Build a modal for editing a specific section
async function buildEditModal(fullId, i18n, rawType, embed = {}) {
  // Normalize the type completely
  const type = (rawType || '').toString().toLowerCase().replace(/^edit_/, '').split(':')[0].trim();

  const modal = new ModalBuilder()
    .setCustomId(fullId)
    .setTitle(i18n?.modalCustomize || 'Customize Embed');

  const e = embed?.data || {};

  if (type === 'thumbnail') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('input_icon')
          .setLabel(`${i18n?.inputImgFor || 'Image URL for'} Thumbnail`)
          .setPlaceholder('https://example.com/image.png')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(e.thumbnail?.url || '')
      )
    );
  } else if (type === 'color') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('input_text')
          .setLabel(i18n?.inputHex || 'Enter Hex Color')
          .setPlaceholder(config.Embed_Color || '#a265ff')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
  } else if (type === 'author' || type === 'footer') {
    const current = type === 'author' ? e.author : e.footer;
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('input_text')
          .setLabel(`Text for ${type}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(current?.name || current?.text || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('input_icon')
          .setLabel(`Icon URL for ${type}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(current?.icon_url || current?.iconURL || '')
      )
    );
  } else {
    // fallback field so Discord never rejects the modal
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('fallback_field')
          .setLabel('Enter any text (debug fallback)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(`Unknown type: ${type}`)
      )
    );
  }

  return modal;
}



// Build "Load Theme" modal
function buildTemplateModal(fullId, i18n) {
  return new ModalBuilder()
    .setCustomId(fullId)
    .setTitle(i18n.tplTitle)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('template_id')
          .setLabel(i18n.tplInput)
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

// Build "Save Layout" modal
function buildSaveLayoutModal(fullId, i18n) {
  return new ModalBuilder()
    .setCustomId(fullId)
    .setTitle(i18n.saveNewTitle)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('layout_name')
          .setLabel(i18n.saveNewName)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(30)
      )
    );
}



module.exports = {
  data: new SlashCommandBuilder()
    .setName('customize')
    .setDescription('Customize your default answer embed')
    .addSubcommand(sub =>
      sub.setName('start').setDescription('Open the interactive embed customizer.')
    )
    .addSubcommand(sub =>
      sub.setName('current').setDescription('Show your currently selected embed theme.')
    )
    .addSubcommand(sub =>
      sub.setName('reset').setDescription('Reset your embed theme to the default style.')
    )
    .setDMPermission(true),

  // NOTE: original category was "Plus" in your code, but you told me
  // to stop using Plus category and make commands free unless they
  // truly require plus. This is a settings-style command, so:
  category: 'Plus',
  

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const subcommand = interaction.options.getSubcommand(false) || 'start';
    // language pack
    const i18n = {
      titleHere: await translateText('The Title Is Here', lang),
      descHere: await translateText('This is the Description.', lang),

      btnThumbnail: await translateText('Thumbnail', lang),
      btnAuthor: await translateText('Author', lang),
      btnColor: await translateText('Color', lang),
      btnFooter: await translateText('Footer', lang),
      btnTemplate: await translateText('Load Theme', lang),
      btnDefault: await translateText('Default', lang),
      btnCancel: await translateText('Cancel', lang),
      btnDone: await translateText('Done', lang),

      modalCustomize: await translateText('Customize Embed', lang),

      modalConfirmCancel: await translateText('Confirm Cancellation', lang),
      modalConfirmDefault: await translateText('Confirm Default Theme', lang),

      inputImgFor: await translateText('Enter image URL for', lang),
      inputNewText: await translateText('Enter new', lang),
      inputHex: (await translateText('Enter Hex Code (Default: {code})', lang)).replace('{code}', config.Embed_Color),

      invalidImg: await translateText(
        'Thumbnail must be a direct image URL ending in .png, .jpg, .jpeg, .gif, or .webp',
        lang
      ),
      invalidHex: await translateText(
        'Color must be a valid hex color code like #FF0000 or FF0000',
        lang
      ),

      goBack: await translateText('Go back to message', lang),

      tplTitle: await translateText('Apply a Template', lang),
      tplInput: await translateText('Enter Template ID (empty to reset)', lang),

      noTpl: await translateText('No Template found with ID: ', lang),

      saveNewTitle: await translateText('Save New Theme', lang),
      saveNewName: await translateText('Theme Name', lang),
      savedOk: await translateText('✅ Theme: Success', lang),
      savedAsId: await translateText('Theme saved as ID ', lang),

      cannotSaveDefault: await translateText('You cannot save the default theme. Change something first.', lang),
      alreadyExists: await translateText(
        "There's already a layout with those exact settings.\nTheme ID: ",
        lang
      ),

      cancelled: await translateText('Customization Cancelled', lang),
      cancelledDesc: await translateText('Your customization has been cancelled.', lang),

      mustTypeCancel: await translateText('You must type CANCEL to confirm.', lang),
      mustTypeConfirm: await translateText('You must type CONFIRM to confirm.', lang),
    };

    // per-session unique suffix so 2 users / 2 runs don't overlap
    const SID = `${interaction.id}_${interaction.user.id}`;
    const withSid = (id) => `${id}:${SID}`;

    // load storage
    let layouts = loadJSON(layoutsPath);
    let userLayouts = loadJSON(userLayoutsPath);

    if (subcommand === 'reset') {
      delete userLayouts[interaction.user.id];
      recalcUses(layouts, userLayouts);
      saveJSON(layoutsPath, layouts);
      saveJSON(userLayoutsPath, userLayouts);

      const resetEmbed = await getUserEmbed(interaction.user.id, 'Customize');
      resetEmbed
        .setTitle(await translateText('Layout Reset', lang))
        .setDescription(await translateText('Your layout has been reset to the default style.', lang));
      return interaction.editReply({ embeds: [resetEmbed] });
    }

    if (subcommand === 'current') {
      const layoutId = userLayouts[interaction.user.id];
      const layout = layoutId && layouts[layoutId] ? layouts[layoutId] : null;
      const infoEmbed = await getUserEmbed(interaction.user.id, 'Customize');
      if (!layout) {
        infoEmbed.setDescription(await translateText('You are currently using the default theme.', lang));
      } else {
        infoEmbed.setDescription(
          'Theme ID: ' + layoutId + '' +
          '\nName: **' + (layout.name || 'Unnamed') + '**' +
          '\nUses: **' + (layout.uses || 0) + '**'
        );
      }
      return interaction.editReply({ embeds: [infoEmbed] });
    }

    const currentUserLayoutId = userLayouts[interaction.user.id];
    const currentUserLayout = currentUserLayoutId && layouts[currentUserLayoutId]
      ? layouts[currentUserLayoutId]
      : null;

    // start embed from user layout (or default)
    let workingEmbed = await buildEmbedFromLayout(currentUserLayout, i18n);

    // send initial preview
    let message = await interaction.editReply({
      embeds: [cloneEmbed(workingEmbed)],
      components: buildMainRows(i18n, SID),
      fetchReply: true
    });


    async function refreshPreview() {
      // rebuild to avoid Builder mutation caching issues
      await interaction.editReply({
        embeds: [cloneEmbed(workingEmbed)],
        components: buildMainRows(i18n, SID)
      }).catch(e => console.error('refreshPreview editReply error:', e));
    }

    async function applyLayoutToWorking(layout) {
      // Rebuild whole embed from layout each time for consistency
      workingEmbed = await buildEmbedFromLayout(layout, i18n);
    }


    // stop previous customization collector if user re-runs the command
    if (interaction.client.activeCustomizers?.[interaction.user.id]) {
      interaction.client.activeCustomizers[interaction.user.id].stop('new_session');
    }
    interaction.client.activeCustomizers ??= {};
    interaction.client.activeCustomizers[interaction.user.id] = null; // reserve spot


    // We use ONE component collector + ONE modal handler, both scoped via SID.
    const componentCollector = message.createMessageComponentCollector({
      time: 5 * 60_000 // 5 min timeout
    });

    interaction.client.activeCustomizers[interaction.user.id] = componentCollector;
    componentCollector.on('end', () => {
      delete interaction.client.activeCustomizers[interaction.user.id];
    });


    // helper: open a modal
// helper: open a modal safely
async function openModalFor(btnInt, type) {
  try {

    type = type.split(':')[0];

    const id = `modal_${type}:${SID}`;
    let modal;

    switch (type) {
      case 'cancel_customize':
        modal = buildConfirmModal(
          id,
          i18n.modalConfirmCancel || 'Confirm Cancellation',
          'cancel_confirm',
          'Type CANCEL to confirm',
          'CANCEL'
        );
        break;

      case 'default_customize':
        modal = buildConfirmModal(
          id,
          i18n.modalConfirmDefault || 'Confirm Default Theme',
          'default_confirm',
          'Type CONFIRM to confirm',
          'CONFIRM'
        );
        break;

      case 'template_apply':
        modal = buildTemplateModal(id, i18n);
        break;

      case 'save_layout':
        modal = buildSaveLayoutModal(id, i18n);
        break;

      case 'edit_author':
      case 'edit_color':
      case 'edit_footer':
      case 'edit_thumbnail':
        modal = await buildEditModal(id, i18n, type.replace('edit_', ''), workingEmbed);
        break;

      default:
        console.warn('Unknown modal type:', type);
        return;
    }
    if (!modal || typeof modal.toJSON !== 'function') {
      console.error('openModalFor failed: modal builder returned', modal);
      return btnInt.reply({
        ephemeral: true,
        content: 'Modal could not be built.',
      });
    }

    const modalJson = modal.toJSON();
    if (!modalJson.custom_id || !modalJson.title || !Array.isArray(modalJson.components) || modalJson.components.length === 0) {
      console.error('openModalFor invalid modal structure', modalJson);
      return btnInt.reply({
        ephemeral: true,
        content: 'Modal build incomplete. Check console.',
      });
    }

    await btnInt.showModal(modal);
  } catch (err) {
    console.error('showModal error (openModalFor):', err);
    if (!btnInt.deferred && !btnInt.replied) {
      await btnInt.reply({ ephemeral: true, content: 'Failed to open modal.' });
    }
  }
}


    // COMPONENT CLICK HANDLER
    componentCollector.on('collect', async (btnInt) => {
      try {
        if (btnInt.user.id !== interaction.user.id) return;
        if (!btnInt.customId.endsWith(`:${SID}`)) return; // ignore other sessions

        const baseId = btnInt.customId.split(':')[0]; // e.g. "edit_color"

        // open modal for edit actions / special actions
        if (
          baseId === 'edit_thumbnail' ||
          baseId === 'edit_author' ||
          baseId === 'edit_color' ||
          baseId === 'edit_footer' ||
          baseId === 'template_apply' ||
          baseId === 'cancel_customize' ||
          baseId === 'default_customize'
        ) {
          return openModalFor(btnInt, baseId);
        }

        if (baseId === 'done_customize') {
          // user wants to save/apply layout -> may need a new layout name or reuse
          // we don't instantly finalize - we prompt naming IF new
          // But if layout already exists, we just apply.
          // We'll handle the logic here because it's not just "open modal".
          const layoutData = await getLayoutFromEmbed(workingEmbed);

          // can't store default as "new"
          if (await isDefaultLayout(layoutData)) {
            const errEmbed = await getUserEmbed(interaction.user.id, null, 'error');
            errEmbed.setDescription(i18n.cannotSaveDefault);

            if (btnInt.deferred || btnInt.replied) {
              try {
                await btnInt.followUp({ ephemeral: true, embeds: [errEmbed] });
              } catch {}
            } else {
              return btnInt.reply({ ephemeral: true, embeds: [errEmbed] });
            }
            return;
          }

          // reload latest (to avoid race if multiple users saving at once)
          layouts = loadJSON(layoutsPath);
          userLayouts = loadJSON(userLayoutsPath);

          // see if this exact layout already exists
          const currentHash = layoutHash(layoutData);
          const dupe = Object.entries(layouts).find(([id, lay]) => {
            return embedEquals(lay, layoutData) || layoutHash(lay) === currentHash;
          });

          if (dupe) {
            const dupeId = dupe[0];

            // bump usage counts smartly
            const prevUserLayout = userLayouts[interaction.user.id];
            if (prevUserLayout && layouts[prevUserLayout] && prevUserLayout !== dupeId) {
              layouts[prevUserLayout].uses = Math.max((layouts[prevUserLayout].uses || 1) - 1, 0);
            }
            layouts[dupeId].uses = (layouts[dupeId].uses || 0) + 1;

            userLayouts[interaction.user.id] = dupeId;

            recalcUses(layouts, userLayouts);
            saveJSON(layoutsPath, layouts);
            saveJSON(userLayoutsPath, userLayouts);


            componentCollector.stop(); // end session

            const confirmEmbed = await getUserEmbed(interaction.user.id, 'Customization');
            confirmEmbed
              .setTitle(i18n.savedOk)
              .setDescription(`${i18n.alreadyExists} \`${dupeId}\``);

            return btnInt.update({ embeds: [confirmEmbed], components: [] });
          }

          // no dupe -> ask user to name layout in a modal
          return openModalFor(btnInt, 'save_layout');
        }

if (baseId === 'reset_customize') {
  // delete user layout from file
  delete userLayouts[interaction.user.id];

  // 🔹 recalc all uses live so the layout count drops instantly
  recalcUses(layouts, userLayouts);
  saveJSON(layoutsPath, layouts);
  saveJSON(userLayoutsPath, userLayouts);

  // visually reset embed
  workingEmbed
    .setColor(config.Embed_Color)
    .setAuthor({ name: config.Embed_Author_Name, iconURL: config.Embed_Author_Icon })
    .setFooter({ text: config.Embed_Footer, iconURL: config.Embed_Footer_Icon })
    .setThumbnail(config.Embed_Thumbnail_Icon)
    .setTitle(i18n.titleHere)
    .setDescription(i18n.descHere);

  const resetEmbed = await getUserEmbed(interaction.user.id, 'Layout');
  resetEmbed
    .setTitle(await translateText('Layout Reset', lang))
    .setDescription(await translateText('Your layout has been reset to the default style.', lang));

  await btnInt.update({ embeds: [resetEmbed], components: [] });
  componentCollector.stop();
  return;
}




        // fallback: unknown button
        console.warn('Unhandled button:', baseId);
      } catch (err) {
        console.error('componentCollector.on("collect") error:', err);
      }
    });

    // MODAL HANDLER
    const modalHandler = async (modalInt) => {
      try {
        if (!modalInt.isModalSubmit()) return;
        if (modalInt.user.id !== interaction.user.id) return;
        if (!modalInt.customId.includes(`:${SID}`)) return;

        const modalBase = modalInt.customId.split(':')[0]; // e.g. "modal_edit_color"
        // remove leading "modal_"
        const action = modalBase.replace(/^modal_/, ''); // "edit_color" or "cancel_customize" etc.

        // helper to reply ephemeral errors
        async function ephemeralError(desc) {
          const errEmbed = await getUserEmbed(interaction.user.id, null, 'error');
          errEmbed.setDescription(`${desc}\n[${i18n.goBack}](${message.url})`);
          if (modalInt.deferred || modalInt.replied) {
            try { await modalInt.followUp({ ephemeral: true, embeds: [errEmbed] }); } catch {}
          } else {
            await modalInt.reply({ ephemeral: true, embeds: [errEmbed] });
          }
        }

        // 1) CANCEL CUSTOMIZE CONFIRM
        if (action === 'cancel_customize') {
          const val = modalInt.fields.getTextInputValue('cancel_confirm')?.trim();
          if (val !== 'CANCEL') {
            return ephemeralError(i18n.mustTypeCancel);
          }

          componentCollector.stop();

          const doneEmbed = await getUserEmbed(interaction.user.id, 'Customization');
          doneEmbed
            .setTitle(await translateText('Customization Cancelled', lang))
            .setDescription(await translateText('Your customization process was cancelled and no changes were saved.', lang));

          await modalInt.update({ embeds: [doneEmbed], components: [] });
          return;
        }

        // 2) DEFAULT CUSTOMIZE CONFIRM
        if (action === 'default_customize') {
          const val = modalInt.fields.getTextInputValue('default_confirm')?.trim();
          if (val !== 'CONFIRM') {
            return ephemeralError(i18n.mustTypeConfirm);
          }

          // reset workingEmbed to "factory default"
          const def = await getDefaultLayout();
          await applyLayoutToWorking(def);

          await modalInt.deferUpdate();
          await refreshPreview();
          return;
        }

        // 3) TEMPLATE APPLY
        if (action === 'template_apply') {
          const tplId = modalInt.fields.getTextInputValue('template_id')?.trim();

          // reload fresh for safety
          layouts = loadJSON(layoutsPath);
          userLayouts = loadJSON(userLayoutsPath);

          if (!tplId) {
            // "empty input" = reset to either current user's layout OR full default
            if (currentUserLayout) {
              await applyLayoutToWorking(currentUserLayout);
            } else {
              const def = await getDefaultLayout();
              await applyLayoutToWorking(def);
            }
            await modalInt.deferUpdate();
            await refreshPreview();
            return;
          }

          if (!layouts[tplId]) {
            await ephemeralError(`${i18n.noTpl} \`${tplId}\``);
            return;
          }

          await applyLayoutToWorking(layouts[tplId]);
          await modalInt.deferUpdate();
          await refreshPreview();
          return;
        }

        // 4) SAVE LAYOUT
        if (action === 'save_layout') {
          const layoutName = modalInt.fields.getTextInputValue('layout_name').trim();

          // reload again to reduce race
          layouts = loadJSON(layoutsPath);
          userLayouts = loadJSON(userLayoutsPath);

          const layoutFromEmbed = await getLayoutFromEmbed(workingEmbed);
          const layoutData = { ...layoutFromEmbed, name: layoutName };


          if (await isDefaultLayout(layoutData)) {
            const errEmbed = await getUserEmbed(interaction.user.id, null, 'error');
            errEmbed.setDescription(i18n.cannotSaveDefault);
            componentCollector.stop();
            await modalInt.update({ embeds: [errEmbed], components: [] });
            return;
          }

          // check duplicates one more time
          const currentHash = layoutHash(layoutData);
          const dupe = Object.entries(layouts).find(([id, lay]) => {
            return embedEquals(lay, layoutData) || layoutHash(lay) === currentHash;
          });

          if (dupe) {
            // already exists
            const dupeId = dupe[0];
            const prevUserLayout = userLayouts[interaction.user.id];
            if (prevUserLayout && layouts[prevUserLayout] && prevUserLayout !== dupeId) {
              layouts[prevUserLayout].uses = Math.max((layouts[prevUserLayout].uses || 1) - 1, 0);
            }
            layouts[dupeId].uses = (layouts[dupeId].uses || 0) + 1;
            userLayouts[interaction.user.id] = dupeId;

            recalcUses(layouts, userLayouts);
            saveJSON(layoutsPath, layouts);
            saveJSON(userLayoutsPath, userLayouts);


            componentCollector.stop();

            const confirm = await getUserEmbed(interaction.user.id, 'Layout');
            confirm
              .setTitle(await translateText('Identical Layout Found', lang))
              .setDescription(`${await translateText('A theme with the same settings already exists.', lang)}\n\n**Theme ID:** \`${dupeId}\``);

            await modalInt.update({ embeds: [confirm], components: [] });
            return;
          }

          // create new layout
          const newId = (
            Math.max(0, ...Object.keys(layouts).map(n => Number(n) || 0)) + 1
          ).toString();

          layouts[newId] = {
            ...layoutData,
            creator_id: interaction.user.id,
            uses: 1,
          };

          const oldId = userLayouts[interaction.user.id];
          if (oldId && oldId !== newId && layouts[oldId]) {
            layouts[oldId].uses = Math.max((layouts[oldId].uses || 1) - 1, 0);
          }

          userLayouts[interaction.user.id] = newId;
          recalcUses(layouts, userLayouts);
          saveJSON(layoutsPath, layouts);
          saveJSON(userLayoutsPath, userLayouts);


          componentCollector.stop();

          const confirm = await getUserEmbed(interaction.user.id, 'Layout');
          confirm
            .setTitle(await translateText('Layout Saved', lang))
            .setDescription(
              `${await translateText('Your theme has been successfully saved.', lang)}\n\n**Theme ID:** \`${newId}\``
            );

          await modalInt.update({ embeds: [confirm], components: [] });
          return;
        }

        // 5) EDIT_* (author / footer / thumbnail / color)
        if (
          action.startsWith('edit_')
        ) {
          const field = action.replace('edit_', ''); // "author", "color", "footer", "thumbnail"

          if (field === 'thumbnail') {
            // thumbnail only uses input_icon
            const icon = modalInt.fields.getTextInputValue('input_icon')?.trim();
            if (!icon) {
              workingEmbed.setThumbnail(null);
            } else if (!isImageLink(icon)) {
              return ephemeralError(i18n.invalidImg);
            } else {
              workingEmbed.setThumbnail(await makePermanent(icon));
            }

            await modalInt.deferUpdate();
            await refreshPreview();
            return;
          }

          if (field === 'color') {
            const txt = modalInt.fields.getTextInputValue('input_text')?.trim() || '';
            const isHex = /^#?[0-9A-F]{6}$/i.test(txt);
            if (!isHex) {
              return ephemeralError(i18n.invalidHex);
            }
            workingEmbed.setColor(txt.startsWith('#') ? txt : `#${txt}`);

            await modalInt.deferUpdate();
            await refreshPreview();
            return;
          }

          // author/footer
          const textVal = modalInt.fields.getTextInputValue('input_text')?.trim() || '';
          const iconVal = modalInt.fields.getTextInputValue('input_icon')?.trim() || '';

          if (field === 'author') {
            if (!textVal && !iconVal) {
              workingEmbed.setAuthor(null);
            } else {
              const obj = {};
              // prefer new text, else keep old if exists, else fallback to config
              obj.name =
                textVal ||
                workingEmbed.data.author?.name ||
                config.Embed_Author_Name ||
                ' ';
              if (iconVal && isImageLink(iconVal)) obj.iconURL = await makePermanent(iconVal);
              workingEmbed.setAuthor(obj);
            }
          } else if (field === 'footer') {
            if (!textVal && !iconVal) {
              workingEmbed.setFooter(null);
            } else {
              const obj = {};
              // Append config.Embed_Rest_Footer if any
              if (textVal) {
                obj.text = `${textVal} ${config.Embed_Rest_Footer || ''}`.trim().slice(0, 2048);
              } else {
                // fallback
                obj.text = workingEmbed.data.footer?.text || config.Embed_Footer || ' ';
              }
              if (iconVal && isImageLink(iconVal)) obj.iconURL = await makePermanent(iconVal);
              workingEmbed.setFooter(obj);
            }
          }

          await modalInt.deferUpdate();
          await refreshPreview();
          return;
        }

        // unknown modal action (shouldn't happen)
        console.warn('Unhandled modal action:', action);
      } catch (err) {
        console.error('modalHandler error:', err);
      }
    };

    // scoped modal handler that ignores other sessions/users
    async function boundModalHandler(int) {
      try {
        if (!int.isModalSubmit()) return;
        if (int.user.id !== interaction.user.id) return;
        if (!int.customId.includes(`:${SID}`)) return;
        await modalHandler(int);
      } catch (err) {
        console.error('scoped modalHandler error:', err);
      }
    }

    interaction.client.on(Events.InteractionCreate, boundModalHandler);

    componentCollector.on('end', async () => {
      interaction.client.removeListener(Events.InteractionCreate, boundModalHandler);
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    });

  },
};






