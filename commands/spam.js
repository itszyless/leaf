const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserEmbed } = require('../utils/getUserEmbed');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const cooldownPath = path.join(__dirname, '../data/spamCooldown.json');
const adminsPath = path.join(__dirname, '../data/admins.json');
const plusPath = path.join(__dirname, '../data/plusUsers.json');

function safeReadJSON(file) {
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '{}');
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function safeWriteJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}

function generateProgressBar(current, total, size = 10) {
  const progress = Math.min(Math.max(current / total, 0), 1);
  const filled = Math.round(progress * size);
  const empty = size - filled;
  return `[${'?'.repeat(filled)}${'?'.repeat(empty)}]`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spam')
    .setDescription('Spam messages in the current channel')
    .addStringOption(opt =>
      opt.setName('text')
        .setDescription('Custom spam message (plus only)')
        .setRequired(false)
    )
    .setDMPermission(false),
  category: 'Utility',
  hidden: true,

  async execute(interaction) {
    const userId = interaction.user.id;
    const now = Date.now();

    // Load data safely
    const admins = safeReadJSON(adminsPath);
    const plusUsers = safeReadJSON(plusPath);
    const cooldowns = safeReadJSON(cooldownPath);

    const isAdmin = !!admins[userId];
    const isPlus = !!plusUsers[userId];

    const cooldownDuration = isAdmin ? 2000 : isPlus ? 4000 : 7000;

    // Cooldown check
    const lastUsed = cooldowns[userId] || 0;
    const diff = now - lastUsed;
    if (diff < cooldownDuration) {
      const remaining = (cooldownDuration - diff) / 1000;
      const progress = generateProgressBar(diff, cooldownDuration, 12);

      const lang = getUserLanguage(userId);
      const waitMsg = await translateText('Please wait before using this command again.', lang);

      const embed = await getUserEmbed(userId, null, 'error');
      embed.setDescription(`${waitMsg}\n${progress}\n**${remaining.toFixed(1)} s remaining**`);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    // Update cooldown
    cooldowns[userId] = now;
    safeWriteJSON(cooldownPath, cooldowns);

    const inputText = interaction.options.getString('text');
    const message = isPlus && inputText ? inputText : config.SpamDefaultText;

    try {
      await interaction.deleteReply().catch(() => {});
    } catch {}

    // Send spam bursts
    const totalBursts = 5;
    for (let i = 0; i < totalBursts; i++) {
      setTimeout(() => {
        interaction.followUp({ content: `# ${message}` }).catch(() => {});
      }, i * 250);
    }
  }
};

