const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} = require('discord.js');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const themesPath = path.join(__dirname, '../data/embedThemes.json');
const userThemesPath = path.join(__dirname, '../data/userThemes.json');

/* ───────────────────────── helpers ───────────────────────── */

function formatNumber(num) {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
}

function loadJSON(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function recalcUses(themes, userThemes) {
  for (const id of Object.keys(themes)) themes[id].uses = 0;
  for (const userId of Object.keys(userThemes)) {
    const themeId = userThemes[userId];
    if (themeId && themes[themeId]) themes[themeId].uses++;
  }
}

/* ───────────────────────── command ───────────────────────── */

module.exports = {
  data: new SlashCommandBuilder()
    .setName('themes')
    .setDescription('Manage your custom embed themes.')
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List your created themes or someone else’s.')
        .addUserOption(opt =>
          opt.setName('user').setDescription('View themes of another user.')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('rename')
        .setDescription('Rename a theme you created.')
        .addStringOption(opt =>
          opt.setName('id').setDescription('Theme ID').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('newname').setDescription('New theme name').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Delete one of your themes.')
        .addStringOption(opt =>
          opt.setName('id').setDescription('Theme ID').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('use')
        .setDescription('Apply an existing theme by ID.')
        .addStringOption(opt =>
          opt.setName('id').setDescription('Theme ID').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('current')
        .setDescription('Show your currently selected theme.')
    )
    .addSubcommand(sub =>
      sub
        .setName('top')
        .setDescription('Show the top 10 most used themes.')
    ),

  category: 'Plus',

  async execute(interaction) {
    try {
      const lang = getUserLanguage(interaction.user.id) || 'en';
      const themes = loadJSON(themesPath);
      const userThemes = loadJSON(userThemesPath);
      const sub = interaction.options.getSubcommand();
      if (sub === 'current') {
        const currentId = userThemes[interaction.user.id];
        const current = currentId && themes[currentId] ? themes[currentId] : null;
        const embed = await getUserEmbed(interaction.user.id, 'Themes');

        if (!current) {
          embed.setDescription(await translateText('You are currently using the default theme.', lang));
        } else {
          const pId = await translateText('Theme ID', lang);
          const pName = await translateText('Name', lang);
          const pUses = await translateText('Uses', lang);
          const pCreator = await translateText('Creator', lang);
          embed.setDescription(
            `${pId}: \`${currentId}\`\n` +
            `> ${config['Arrow-Icon']} ${pName}: **${current.name || 'Unknown'}**\n` +
            `> ${config['Arrow-Icon']} ${pUses}: **${formatNumber(current.uses || 0)}**\n` +
            `> ${config['Arrow-Icon']} ${pCreator}: <@${current.creator_id}>`
          );
        }

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'use') {
        const id = interaction.options.getString('id');
        if (!themes[id]) {
          const err = await getUserEmbed(interaction.user.id, null, 'error');
          err.setDescription(await translateText('Theme not found.', lang));
          return interaction.editReply({ embeds: [err] });
        }

        userThemes[interaction.user.id] = id;
        recalcUses(themes, userThemes);
        saveJSON(themesPath, themes);
        saveJSON(userThemesPath, userThemes);

        const embed = await getUserEmbed(interaction.user.id, 'Themes');
        embed.setDescription(`${await translateText('Theme applied.', lang)}\n\n**Theme ID:** \`${id}\``);
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'top') {
        const sorted = Object.entries(themes)
          .sort((a, b) => (b[1].uses || 0) - (a[1].uses || 0))
          .slice(0, 10);

        if (sorted.length === 0) {
          const err = await getUserEmbed(interaction.user.id, null, 'error');
          err.setDescription(await translateText('No themes found.', lang));
          return interaction.editReply({ embeds: [err] });
        }

        const embed = await getUserEmbed(interaction.user.id, 'Top Themes');
        embed.setTitle(await translateText('Top Themes', lang));
        const p1 = await translateText('ID', lang);
        const p2 = await translateText('Uses', lang);
        const p3 = await translateText('Creator', lang);
        const p4 = await translateText('Name', lang);
        const p5 = await translateText('Unknown', lang);
        embed.setDescription(
          sorted.map(([id, theme], index) =>
            `#${index + 1} - ${p1}: \`${id}\`\n> ${config['Arrow-Icon']} ${p4}: ${theme.name || p5}\n> ${config['Arrow-Icon']} ${p2}: **${formatNumber(theme.uses || 0)}**\n> ${config['Arrow-Icon']} ${p3}: <@${theme.creator_id}>`
          ).join('\n')
        );
        return interaction.editReply({ embeds: [embed] });
      }

      /* ─────────────── LIST ─────────────── */
      if (sub === 'list') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userThemesList = Object.entries(themes)
          .filter(([_, theme]) => theme.creator_id === targetUser.id)
          .sort((a, b) => (b[1].uses || 0) - (a[1].uses || 0));

        let page = 0;
        const perPage = 3;
        const totalPages = Math.ceil(userThemesList.length / perPage);
        const errorEmbed = await getUserEmbed(interaction.user.id, null, 'error');

        const getPageEmbed = async () => {
          if (userThemesList.length === 0) {
            errorEmbed.setDescription(
                targetUser.id === interaction.user.id
                  ? await translateText("You haven't created any custom themes yet.", lang)
                  : `${targetUser.username} ` + await translateText("hasn't created any custom themes yet.", lang)
            );
            return errorEmbed;
          } else {
            const embed = await getUserEmbed(interaction.user.id, 'Themes');
            const titleText =
              targetUser.id === interaction.user.id
                ? await translateText('Your Themes', lang)
                : `${targetUser.username}'s ` + await translateText(`Themes`, lang);
            embed.setTitle(titleText);

            const start = page * perPage;
            const paged = userThemesList.slice(start, start + perPage);
            const p_ = await translateText('Sorted by most used', lang);
            const p_1 = await translateText('Page', lang);
            const p_2 = await translateText('of', lang);
            const p_3 = await translateText('Theme ID', lang);
            const p_4 = await translateText('Name', lang);
            const p_5 = await translateText('Unknown', lang);
            const p_6 = await translateText('Uses', lang);

            embed.setDescription(
              `(${p_})\n-# ${p_1} ${page + 1} ${p_2} ${totalPages}\n\n` +
                paged
                  .map(
                    ([id, theme]) =>
                      `${p_3}: \`${id}\`\n> ${config['Arrow-Icon']} ${p_4}: ${
                        theme.name || `${p_5}`
                      }\n> ${config['Arrow-Icon']} ${p_6}: **${formatNumber(theme.uses) || 0}**`
                  )
                  .join('\n')
            );
            return embed;
          }
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('prev_themes')
            .setLabel(await translateText('Previous', lang))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('next_themes')
            .setLabel(await translateText('Next', lang))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(totalPages <= 1)
        );

        const msg = await interaction.editReply({
          embeds: [await getPageEmbed()],
          components: userThemesList.length > 0 ? [row] : []
        });

        const collector = msg.createMessageComponentCollector({ time: 120_000 });

        collector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) return;
          if (i.customId === 'prev_themes') page--;
          if (i.customId === 'next_themes') page++;

          row.components[0].setDisabled(page === 0);
          row.components[1].setDisabled(page >= totalPages - 1);

          await i.update({ embeds: [await getPageEmbed()], components: [row] }).catch(() => {});
        });

        return;
      }


      /* ─────────────── RENAME ─────────────── */
      if (sub === 'rename') {
        const id = interaction.options.getString('id');
        const newName = interaction.options.getString('newname').trim();

        if (!themes[id]) {
          const err = await getUserEmbed(interaction.user.id, null, 'error');
          err.setDescription(await translateText('Theme not found.', lang));
          return interaction.editReply({ embeds: [err] });
        }

        const theme = themes[id];
        if (
          theme.creator_id !== interaction.user.id &&
          interaction.user.id !== config.Owner_ID
        ) {
          const err = await getUserEmbed(interaction.user.id, null, 'error');
          err.setDescription(
            await translateText('You are not allowed to rename this theme.', lang)
          );
          return interaction.editReply({ embeds: [err] });
        }

        theme.name = newName;
        saveJSON(themesPath, themes);

        const emb = await getUserEmbed(interaction.user.id, 'Themes');
        const p__ = await translateText('has been renamed to', lang);
        const p__1 = await translateText('Theme', lang);
        emb.setDescription(
          `${p__1} \`${id}\` ${p__} **${newName}**.`
        );
        return interaction.editReply({ embeds: [emb] });
      }

      /* ─────────────── DELETE ─────────────── */
      if (sub === 'delete') {
        const id = interaction.options.getString('id');

        if (!themes[id]) {
          const err = await getUserEmbed(interaction.user.id, null, 'error');
          err.setDescription(await translateText('Theme not found.', lang));
          return interaction.editReply({ embeds: [err] });
        }

        const theme = themes[id];
        if (
          theme.creator_id !== interaction.user.id &&
          interaction.user.id !== config.Owner_ID
        ) {
          const err = await getUserEmbed(interaction.user.id, null, 'error');
          err.setDescription(
            await translateText('You are not allowed to delete this theme.', lang)
          );
          return interaction.editReply({ embeds: [err] });
        }

        // Step 1: send confirmation buttons
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_delete_${id}`)
            .setLabel(await translateText('Confirm Delete', lang))
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel_delete')
            .setLabel(await translateText('Cancel', lang))
            .setStyle(ButtonStyle.Secondary)
        );

        const confirmEmbed = await getUserEmbed(interaction.user.id, 'Themes');
        const p1_ = await translateText('Are you sure you want to delete theme', lang);
        const p2_ = await translateText('Click Confirm Delete below to proceed.', lang);
        confirmEmbed.setDescription(
            `${p1_} \`${id}\`? ${p2_}`
        );

        const msg = await interaction.editReply({
          embeds: [confirmEmbed],
          components: [confirmRow]
        });

        const collector = msg.createMessageComponentCollector({ time: 60_000 });

        collector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) return;

          // cancel
          if (i.customId === 'cancel_delete') {
            const cancelEmbed = await getUserEmbed(interaction.user.id, 'Themes');
            cancelEmbed.setDescription(await translateText('Deletion cancelled.', lang));
            collector.stop();
            return i.update({ embeds: [cancelEmbed], components: [] }).catch(() => {});
          }

          // open modal on confirm
          if (i.customId === `confirm_delete_${id}`) {
            const modal = new ModalBuilder()
              .setCustomId(`modal_delete_${id}`)
              .setTitle(await translateText('Confirm Theme Deletion', lang))
              .addComponents(
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId('confirm_text')
                    .setLabel(await translateText('Type DELETE to confirm.', lang))
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                )
              );
            await i.showModal(modal);

            const filter = m =>
              m.customId === `modal_delete_${id}` && m.user.id === interaction.user.id;
            const submitted = await i.awaitModalSubmit({ filter, time: 60_000 }).catch(() => null);

            if (!submitted) {
              const timeoutEmbed = await getUserEmbed(interaction.user.id, null, 'error');
              timeoutEmbed.setDescription(
                await translateText('You did not confirm deletion in time.', lang)
              );
              return i.followUp({ ephemeral: true, embeds: [timeoutEmbed] });
            }

            const val = submitted.fields.getTextInputValue('confirm_text').trim().toUpperCase();
            if (val !== 'DELETE') {
              const failEmbed = await getUserEmbed(interaction.user.id, null, 'error');
              failEmbed.setDescription(
                await translateText('Deletion cancelled. You must type DELETE exactly.', lang)
              );
              return submitted.reply({ ephemeral: true, embeds: [failEmbed] });
            }

            // perform deletion
            delete themes[id];
            for (const [userId, themeId] of Object.entries(userThemes)) {
              if (themeId === id) delete userThemes[userId];
            }

            recalcUses(themes, userThemes);
            saveJSON(themesPath, themes);
            saveJSON(userThemesPath, userThemes);

            const successEmbed = await getUserEmbed(interaction.user.id, 'Themes');
            const _1 = await translateText('Theme', lang);
            const _2 = await translateText('has been permanently deleted, and all users using it have been reset to default.', lang);
            successEmbed.setDescription(
              await translateText(
                `${_1} \`${id}\` ${_2}`,
                lang
              )
            );
            collector.stop();
            return submitted.reply({ ephemeral: true, embeds: [successEmbed] });
          }
        });

        collector.on('end', async () => {
          try {
            await interaction.editReply({ components: [] });
          } catch {}
        });

        return;
      }
    } catch (err) {
      console.error('❌ Error in /themes command:', err);

      const errorEmbed = new EmbedBuilder()
        .setColor(config.Embed_Error_Color)
        .setTitle('❌ Command Error')
        .setDescription(`An unexpected error occurred.\n\`\`\`${err.message}\`\`\``)
        .setFooter({ text: 'Check console for details.' });

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ ephemeral: true, embeds: [errorEmbed] });
        } else {
          await interaction.reply({ ephemeral: true, embeds: [errorEmbed] });
        }
      } catch (nestedErr) {
        console.error('❌ Failed to send error reply:', nestedErr);
      }
    }
  }
};

