const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const ms = require('ms');
const fs = require('fs');
const path = require('path');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const remindersPath = path.join(__dirname, '..', 'data', 'reminders.json');

/* ───────────────────────── helpers ───────────────────────── */

function loadReminders() {
  try {
    if (!fs.existsSync(remindersPath)) return {};
    return JSON.parse(fs.readFileSync(remindersPath, 'utf8'));
  } catch (err) {
    console.error('❌ Failed to load reminders:', err);
    return {};
  }
}

function saveReminders(data) {
  try {
    fs.writeFileSync(remindersPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Failed to save reminders:', err);
  }
}

function formatTime(msLeft) {
  const sec = Math.floor(msLeft / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  let parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/* ───────────────────────── core ───────────────────────── */

let clientInstance;
let activeTimers = new Map();

async function sendReminder(userId, message) {
  if (!clientInstance) return;
  try {
    const user = await clientInstance.users.fetch(userId).catch(() => null);
    if (!user) return;

    const userLang = (await getUserLanguage(userId)) || 'en';
    const title = await translateText('Reminder', userLang);
    const desc = await translateText(`Your reminder:`, userLang) + ` **${message}**`;

    const embed = await getUserEmbed(userId, 'Reminder');
    embed.setTitle(`🔔 ${title}`);
    embed.setDescription(desc);

    await user.send({ embeds: [embed] });
  } catch (err) {
    console.warn(`⚠️ Failed to DM reminder to ${userId}: ${err.message}`);
  }
}

function removeReminder(userId, id) {
  const reminders = loadReminders();
  if (!reminders[userId]) return;

  // Remove selected reminder
  reminders[userId] = reminders[userId].filter(r => r.id !== id);

  // Renumber remaining reminders to stay continuous (1, 2, 3...)
  reminders[userId].forEach((r, idx) => {
    r.id = idx + 1;
  });

  if (reminders[userId].length === 0) delete reminders[userId];

  saveReminders(reminders);

  // Clear timeout if it exists
  if (activeTimers.has(`${userId}-${id}`)) {
    clearTimeout(activeTimers.get(`${userId}-${id}`));
    activeTimers.delete(`${userId}-${id}`);
  }
}

function scheduleReminder(userId, reminder) {
  const delay = reminder.remindAt - Date.now();
  if (delay <= 0) {
    sendReminder(userId, reminder.message);
    removeReminder(userId, reminder.id);
    return;
  }

  const key = `${userId}-${reminder.id}`;
  const timeout = setTimeout(() => {
    sendReminder(userId, reminder.message);
    removeReminder(userId, reminder.id);
  }, delay);

  activeTimers.set(key, timeout);
}

function loadAndScheduleReminders() {
  const reminders = loadReminders();
  let total = 0;

  for (const [userId, userRems] of Object.entries(reminders)) {
    for (const reminder of userRems) {
      scheduleReminder(userId, reminder);
      total++;
    }
  }

 // console.log(`✅ Loaded and scheduled ${total} reminders.`);
}

async function init(client) {
  clientInstance = client;
  loadAndScheduleReminders();

  setInterval(() => {
    const reminders = loadReminders();
    let modified = false;
    for (const [userId, userRems] of Object.entries(reminders)) {
      const valid = userRems.filter(r => r.remindAt > Date.now());
      if (valid.length !== userRems.length) {
        reminders[userId] = valid;
        modified = true;
      }
    }
    if (modified) saveReminders(reminders);
  }, 60 * 60 * 1000);
}

/* ───────────────────────── command ───────────────────────── */

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('Manage your personal reminders.')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a new reminder.')
        .addStringOption(opt =>
          opt
            .setName('time')
            .setDescription('When to remind you (e.g. 10m, 2h, 1d)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message').setDescription('Reminder message').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List all your active reminders.')
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Delete a reminder by its ID or delete all.')
        .addStringOption(opt =>
          opt
            .setName('id')
            .setDescription('Reminder ID to delete (or type "all" to delete all)')
            .setRequired(true)
        )
    ),


  category: 'Misc',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const userLang = (await getUserLanguage(userId)) || 'en';
    const reminders = loadReminders();

    /* ─────────────── ADD ─────────────── */
    if (sub === 'add') {
      const timeStr = interaction.options.getString('time');
      const message = interaction.options.getString('message');
      const time = ms(timeStr);

      if (!time || time > ms('1w')) {
        const desc = await translateText('Invalid time or too long (max: 1 week).', userLang);
        const embed = (await getUserEmbed(userId, null, 'error')).setDescription(desc);
        return interaction.editReply({ embeds: [embed] });
      }

      if (!reminders[userId]) reminders[userId] = [];

      // assign incremental ID
      const newId =
        reminders[userId].length > 0
          ? Math.max(...reminders[userId].map(r => r.id)) + 1
          : 1;

      const reminderObj = {
        id: newId,
        message,
        remindAt: Date.now() + time
      };

      reminders[userId].push(reminderObj);
      saveReminders(reminders);
      scheduleReminder(userId, reminderObj);

      const title = await translateText('Reminder Set', userLang);
      const p = await translateText('You will be reminded in', userLang);
      const desc = `${p} ${formatTime(time)}! (#${newId})`;
      const embed = (await getUserEmbed(userId, 'Reminder'))
        .setTitle(`⏰ ${title}`)
        .setDescription(desc);

      return interaction.editReply({ embeds: [embed] });
    }

    /* ─────────────── LIST ─────────────── */
    if (sub === 'list') {
      const userRems = reminders[userId] || [];
      const embed = await getUserEmbed(userId, 'Reminder');

      if (userRems.length === 0) {
        embed.setDescription(await translateText('You have no active reminders.', userLang));
        return interaction.editReply({ embeds: [embed] });
      }

      let page = 0;
      const perPage = 3;
      const totalPages = Math.ceil(userRems.length / perPage);

      const getPage = async () => {
        const start = page * perPage;
        const slice = userRems.slice(start, start + perPage);
        const lines = slice
          .map(r => {
            const remaining = Math.max(0, r.remindAt - Date.now());
            return `🆔 **${r.id}**\n> ${r.message}\n> ⏱️ ${formatTime(remaining)}`;
          })
          .join('\n\n');

        embed.setDescription(`-# Page ${page + 1} of ${totalPages}\n\n${lines}`);
        return embed;
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev_rem')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('next_rem')
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(totalPages <= 1)
      );

      const msg = await interaction.editReply({
        embeds: [await getPage()],
        components: totalPages > 1 ? [row] : []
      });

      const collector = msg.createMessageComponentCollector({ time: 120_000 });

      collector.on('collect', async i => {
        if (i.user.id !== userId) return;
        if (i.customId === 'prev_rem') page--;
        if (i.customId === 'next_rem') page++;

        row.components[0].setDisabled(page === 0);
        row.components[1].setDisabled(page >= totalPages - 1);

        await i.update({ embeds: [await getPage()], components: [row] });
      });

      return;
    }

    /* ─────────────── DELETE ─────────────── */
    if (sub === 'delete') {
      const idInput = interaction.options.getString('id').trim();
      const userRems = reminders[userId] || [];

      // If "all" → remove all reminders
      if (idInput.toLowerCase() === 'all') {
        if (userRems.length === 0) {
          const err = await getUserEmbed(userId, null, 'error');
          err.setDescription(await translateText('You have no reminders to delete.', userLang));
          return interaction.editReply({ embeds: [err] });
        }

        // Cancel all active timers
        for (const rem of userRems) {
          if (activeTimers.has(`${userId}-${rem.id}`)) {
            clearTimeout(activeTimers.get(`${userId}-${rem.id}`));
            activeTimers.delete(`${userId}-${rem.id}`);
          }
        }

        // Remove user section entirely
        delete reminders[userId];
        saveReminders(reminders);

        const emb = await getUserEmbed(userId, 'Reminder');
        emb.setDescription(await translateText('All your reminders have been deleted.', userLang));
        return interaction.editReply({ embeds: [emb] });
      }

      // Otherwise, treat as numeric ID
      const id = parseInt(idInput);
      if (isNaN(id)) {
        const err = await getUserEmbed(userId, null, 'error');
        err.setDescription(await translateText('Invalid ID. Use a number or "all".', userLang));
        return interaction.editReply({ embeds: [err] });
      }

      const target = userRems.find(r => r.id === id);
      if (!target) {
        const err = await getUserEmbed(userId, null, 'error');
        err.setDescription(await translateText('No reminder found with that ID.', userLang));
        return interaction.editReply({ embeds: [err] });
      }

      // Remove single reminder
      removeReminder(userId, id);

      const emb = await getUserEmbed(userId, 'Reminder');
      emb.setDescription(await translateText(`Reminder got deleted.`, userLang));
      return interaction.editReply({ embeds: [emb] });
    }

  },

  init
};
