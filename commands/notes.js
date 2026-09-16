const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const { isPlusActive } = require('../utils/plusAccess');

const notesPath = path.join(__dirname, '../data/notes.json');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('notes')
    .setDescription('Manage your personal notes')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a new note')
        .addStringOption(opt =>
          opt.setName('text').setDescription('Your note').setRequired(true).setMaxLength(200)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('View your notes')
    )
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Edit a note')
        .addIntegerOption(opt => opt.setName('id').setDescription('Note number').setRequired(true))
        .addStringOption(opt => opt.setName('text').setDescription('New content').setRequired(true).setMaxLength(200))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Delete a note')
        .addIntegerOption(opt => opt.setName('id').setDescription('Note number').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('clear').setDescription('Delete all your notes')
    )
    .addSubcommand(sub =>
      sub.setName('download').setDescription('Download your notes as a file')
    ),

  category: 'Personal',

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();
      const userId = interaction.user.id;
      const lang = await getUserLanguage(userId) || 'en';

      let notes = {};
      if (fs.existsSync(notesPath)) {
        notes = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
      }

      const isPlus = isPlusActive(interaction.user.id);
      const freeMaxNotes = config.Free_MaxNotes ?? 5;
      const maxNotes = isPlus ? config.Plus_MaxNotes : freeMaxNotes;

      if (!notes[interaction.user.id]) notes[interaction.user.id] = [];

      if (sub === 'add') {

        if (notes[userId].length >= maxNotes) {
          const msg1 = await translateText('You can only create up to', lang);
          const msg2 = await translateText('notes.', lang);
          const msg3 = await translateText('Free:', lang);
          const msg4 = await translateText('Plus:', lang);
          const msg5 = await translateText('Notes', lang);

          const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
              .setDescription(`${msg1} \`\`${maxNotes}\`\` ${msg2}\n> **${msg3}** \`\`${freeMaxNotes}\`\` ${msg5}\n> **${msg4}** \`\`${config.Plus_MaxNotes}\`\` ${msg5}`);
          return interaction.editReply({ embeds: [embed] });
      }
          const text = interaction.options.getString('text');
      
          notes[interaction.user.id].push(text);
          fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
      
          const title = await translateText('📝 Note Added', lang);
          const msg = await translateText('Your note has been saved.', lang);
      
          const embed = (await getUserEmbed(interaction.user.id, 'Notes-Add'))
            .setTitle(title)
            .setDescription(msg)
      
          await interaction.editReply({ embeds: [embed] });
        } else if (sub === 'list') {

          const userNotes = notes[interaction.user.id] || [];

          const title = await translateText('📝 Your Notes', lang);
          const noNotes = await translateText('You have no notes saved.', lang);

          const errEmbed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(noNotes)

          const embed = (await getUserEmbed(interaction.user.id, 'Notes'))
          .setTitle(title)

          if (userNotes.length === 0) {
          return interaction.editReply({ embeds: [errEmbed] })
          } else {
          embed.setDescription(userNotes.map((n, i) => `**${i + 1}.** ${n}`).join('\n').slice(0, 4000));
          }

          await interaction.editReply({ embeds: [embed] });
        } else if (sub === 'edit') {
          const id = interaction.options.getInteger('id');
          const newText = interaction.options.getString('text');

          const userNotes = notes[interaction.user.id] || [];

          if (id < 1 || id > userNotes.length) {
          const errorText = await translateText('Invalid note ID.', lang);
          const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
              .setDescription(errorText)

          return await interaction.editReply({ embeds: [embed] });
          }

          const oldText = userNotes[id - 1];
          userNotes[id - 1] = newText;
          notes[interaction.user.id] = userNotes;
          fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));

          const title = await translateText('✏️ Note Edited', lang);
          const msg = await translateText(`Note was updated.`, lang);
          const _1 = await translateText(`Before`, lang);
          const _2 = await translateText(`After`, lang);

          const embed = (await getUserEmbed(interaction.user.id, 'Notes-Edit'))
          .setTitle(title)
          .setDescription(`${msg}\n\n**${_1}:** ${oldText}\n**${_2}:** ${newText}`)

          await interaction.editReply({ embeds: [embed] });
        } else if (sub === 'remove') {
          const id = interaction.options.getInteger('id');
      
          const userNotes = notes[interaction.user.id] || [];
      
          if (id < 1 || id > userNotes.length) {
            const errorText = await translateText('Invalid note ID.', lang);
            const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
              .setDescription(errorText)
      
            return await interaction.editReply({ embeds: [embed] });
          }
      
          const removed = userNotes.splice(id - 1, 1);
          notes[interaction.user.id] = userNotes;
          fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
      
          const title = await translateText('🗑️ Note Removed', lang);
          const msg = await translateText(`Removed note:`, lang);
      
          const embed = (await getUserEmbed(interaction.user.id, 'Notes-Remove'))
            .setTitle(title)
            .setDescription(`${msg} *${removed[0]}*`)
      
          await interaction.editReply({ embeds: [embed] });
        } else if (sub === 'clear') {

          const hadNotes = notes[interaction.user.id]?.length > 0;
          delete notes[interaction.user.id];
          fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));

          const title = hadNotes ? await translateText('🧹 Notes Cleared', lang) : await translateText('Error Occurred', lang);
          const msg = hadNotes
          ? await translateText('All your notes have been deleted.', lang)
          : await translateText('You had no notes to delete.', lang);

          const errEmbed = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(msg)

          const embed = (await getUserEmbed(interaction.user.id, 'Notes-Clear'))
          .setTitle(title)
          .setDescription(msg)

          await interaction.editReply({ embeds: [hadNotes ? embed : errEmbed] });
        } else if (sub === 'download') {
      
          const userNotes = notes[interaction.user.id] || [];
      
          const title = await translateText('📄 Notes Export', lang);
          const msg = userNotes.length > 0
            ? await translateText('Your notes are attached as a file.', lang)
            : await translateText('You have no notes to download.', lang);
      
          const errEmbed = (await getUserEmbed(interaction.user.id, null, 'error'))
            .setDescription(msg)
      
          const embed = (await getUserEmbed(interaction.user.id, 'Notes-Download'))
            .setTitle(title)
            .setDescription(msg)
      
          if (userNotes.length === 0) {
            return await interaction.editReply({ embeds: [errEmbed] });
          }
          let content = 'My Notes:'
          content += '\n\n' + userNotes.map((note, i) => `${i + 1}. ${note}`).join('\n');
          const buffer = Buffer.from(content, 'utf-8');
          const attachment = new AttachmentBuilder(buffer, { name: 'notes.txt' });
      
          await interaction.editReply({ embeds: [embed], files: [attachment] });
        }
      } catch (e) {
        //console.log(e)
      }
      }
  
  };
