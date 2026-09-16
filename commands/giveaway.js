const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const ms = require('ms');
const { getUserEmbed } = require('../utils/getUserEmbed');

const giveawaysPath = path.join(__dirname, '..', 'data', 'giveaways.json');
let clientInstance = null;
const activeTimers = new Map();

function ensureClient(client) {
  if (client) clientInstance = client;
  return clientInstance;
}

function loadGiveaways() {
  try {
    if (!fs.existsSync(giveawaysPath)) return {};
    return JSON.parse(fs.readFileSync(giveawaysPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveGiveaways(data) {
  fs.writeFileSync(giveawaysPath, JSON.stringify(data, null, 2));
}

function entrantCount(giveaway) {
  return Array.isArray(giveaway.entries) ? giveaway.entries.length : 0;
}

function formatUsers(ids = []) {
  return ids.length > 0 ? ids.map(id => `<@${id}>`).join(', ') : 'None';
}

function buildGiveawayRows(giveaway) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_join:${giveaway.id}`)
        .setLabel('Join Giveaway')
        .setStyle(ButtonStyle.Success)
    )
  ];
}

async function buildGiveawayEmbed(userId, giveaway, title = 'Giveaway') {
  const embed = await getUserEmbed(userId, 'Giveaway');
  const lines = [
    `Prize: **${giveaway.prize || 'Mystery reward'}**`,
    giveaway.ended
      ? `Ended: <t:${Math.floor((giveaway.endedAt || Date.now()) / 1000)}:R>`
      : `Ends: <t:${Math.floor(giveaway.endsAt / 1000)}:R>`,
    `Winners: **${giveaway.winnerCount || 1}**`,
    `Entries: **${entrantCount(giveaway)}**`
  ];

  if (giveaway.ended) {
    lines.push(`Winner${(giveaway.winners || []).length === 1 ? '' : 's'}: ${formatUsers(giveaway.winners || [])}`);
  }

  embed.setTitle(title).setDescription(lines.join('\n'));
  return embed;
}

async function buildGiveawayPayload(giveaway) {
  const embed = await buildGiveawayEmbed(giveaway.hostId, giveaway, giveaway.ended ? 'Giveaway Ended' : 'Giveaway');
  return { embeds: [embed], components: buildGiveawayRows(giveaway) };
}

async function getGiveawayChannel(giveaway) {
  if (!clientInstance) return null;
  return clientInstance.channels.fetch(giveaway.channelId).catch(() => null);
}

async function getGiveawayMessage(giveaway) {
  const channel = await getGiveawayChannel(giveaway);
  if (!channel) return null;

  return channel.messages.fetch(giveaway.messageId).catch(() => null);
}

async function refreshGiveawayMessage(giveaway) {
  const message = await getGiveawayMessage(giveaway);
  if (!message) return null;

  try {
    await message.edit(await buildGiveawayPayload(giveaway));
    return message;
  } catch {
    return null;
  }
}

function pickWinners(entries, count, excluded = []) {
  let unique = [...new Set(entries || [])].filter(id => !excluded.includes(id));
  if (unique.length === 0) unique = [...new Set(entries || [])];

  const winners = [];
  while (unique.length > 0 && winners.length < count) {
    const index = Math.floor(Math.random() * unique.length);
    winners.push(unique.splice(index, 1)[0]);
  }
  return winners;
}

async function dmReward(giveaway, winnerId) {
  if (!clientInstance) return { ok: false, reason: 'Bot client is not ready.' };
  const user = await clientInstance.users.fetch(winnerId).catch(() => null);
  if (!user) return { ok: false, reason: 'Could not fetch user.' };

  const rewardText = giveaway.rewardText || giveaway.prize || 'No extra reward was provided.';
  const payload = {
    content: `You won **${giveaway.prize || 'a giveaway'}**!\nReward: ${rewardText}`
  };

  if (giveaway.rewardFile?.url) {
    payload.content += `\nFile reward: ${giveaway.rewardFile.url}`;
    payload.files = [new AttachmentBuilder(giveaway.rewardFile.url, { name: giveaway.rewardFile.name || 'reward' })];
  }

  try {
    await user.send(payload);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function announceWinners(giveaway, isReroll = false, failed = []) {
  const channel = await getGiveawayChannel(giveaway);
  if (!channel) return;

  const prefix = isReroll ? 'Rerolled winner' : 'Winner';
  let content = `${prefix}${(giveaway.winners || []).length === 1 ? '' : 's'} of **${giveaway.prize || 'Mystery reward'}** giveaway: ${formatUsers(giveaway.winners || [])}`;

  if (failed.length > 0) {
    const fallbackReward = giveaway.rewardText || giveaway.rewardFile?.url || giveaway.prize || 'No extra reward was provided.';
    content += `\nCould not DM ${failed.map(item => `<@${item.id}>`).join(', ')}. Reward: ${fallbackReward}`;
  }

  const originalMessage = await getGiveawayMessage(giveaway);
  if (originalMessage) {
    return originalMessage.reply({ content }).catch(() => channel.send(content).catch(() => {}));
  }

  return channel.send(content).catch(() => {});
}

async function finalizeGiveaway(id, isReroll = false) {
  const giveaways = loadGiveaways();
  const giveaway = giveaways[id];
  if (!giveaway) return null;
  if (giveaway.ended && !isReroll) return giveaway;

  const previousWinners = isReroll ? (giveaway.winners || []) : [];
  giveaway.ended = true;
  giveaway.endedAt = Date.now();
  giveaway.winners = pickWinners(giveaway.entries, giveaway.winnerCount || 1, previousWinners);
  giveaways[id] = giveaway;
  saveGiveaways(giveaways);

  if (activeTimers.has(id)) {
    clearTimeout(activeTimers.get(id));
    activeTimers.delete(id);
  }

  await refreshGiveawayMessage(giveaway);

  if (giveaway.winners.length === 0) {
    const channel = await getGiveawayChannel(giveaway);
    if (channel) {
      const originalMessage = await getGiveawayMessage(giveaway);
      const content = `Giveaway ended for **${giveaway.prize || 'Mystery reward'}**, but nobody entered.`;
      if (originalMessage) await originalMessage.reply({ content }).catch(() => channel.send(content).catch(() => {}));
      else await channel.send(content).catch(() => {});
    }
    return giveaway;
  }

  const failed = [];
  for (const winnerId of giveaway.winners) {
    const result = await dmReward(giveaway, winnerId);
    if (!result.ok) failed.push({ id: winnerId, reason: result.reason });
  }

  await announceWinners(giveaway, isReroll, failed);
  return giveaway;
}

function scheduleGiveaway(giveaway) {
  const delay = giveaway.endsAt - Date.now();
  if (delay <= 0) {
    finalizeGiveaway(giveaway.id).catch(err => console.error('Giveaway finalize error:', err));
    return;
  }

  if (activeTimers.has(giveaway.id)) clearTimeout(activeTimers.get(giveaway.id));
  activeTimers.set(giveaway.id, setTimeout(() => {
    finalizeGiveaway(giveaway.id).catch(err => console.error('Giveaway finalize error:', err));
  }, delay));
}

function loadAndScheduleGiveaways() {
  const giveaways = loadGiveaways();
  let count = 0;
  for (const giveaway of Object.values(giveaways)) {
    if (!giveaway.ended) {
      scheduleGiveaway(giveaway);
      count++;
    }
  }
//console.log(`Loaded and scheduled ${count} giveaways.`);
}

function init(client) {
  ensureClient(client);
  if (client?.isReady?.()) {
    loadAndScheduleGiveaways();
    return;
  }

  client.once('ready', () => {
    ensureClient(client);
    loadAndScheduleGiveaways();
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create and manage giveaways.')
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Start a giveaway.')
        .addStringOption(opt =>
          opt.setName('duration')
            .setDescription('How long the giveaway lasts, e.g. 10m, 2h, 1d')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('prize')
            .setDescription('Public giveaway prize')
            .setRequired(true)
            .setMaxLength(120)
        )
        .addStringOption(opt =>
          opt.setName('reward')
            .setDescription('Private reward sent to winner by DM, like a code or link')
            .setRequired(false)
            .setMaxLength(1000)
        )
        .addAttachmentOption(opt =>
          opt.setName('file')
            .setDescription('Optional private reward file sent to the winner')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('winners')
            .setDescription('Number of winners')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('end')
        .setDescription('End one of your active giveaways early.')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('Choose one of your active giveaways')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),
  category: 'Utility',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'end') {
      const rawId = interaction.options.getString('id');
      const giveaways = loadGiveaways();
      const giveaway = giveaways[rawId] || Object.values(giveaways).find(g => g.messageId === rawId);
      if (!giveaway || giveaway.ended) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('Giveaway not found or already ended.');
        return interaction.editReply({ embeds: [err] });
      }

      await finalizeGiveaway(giveaway.id);
      const embed = await getUserEmbed(interaction.user.id, 'Giveaway');
      embed.setDescription('Giveaway ended.');
      return interaction.editReply({ embeds: [embed] });
    }

    const duration = interaction.options.getString('duration');
    const prize = interaction.options.getString('prize');
    const rewardText = interaction.options.getString('reward');
    const rewardFile = interaction.options.getAttachment('file');
    const winnerCount = interaction.options.getInteger('winners') || 1;
    const time = ms(duration);

    if (!time || time < 10_000 || time > ms('30d')) {
      const err = await getUserEmbed(interaction.user.id, null, 'error');
      err.setDescription('Invalid duration. Use something like 10m, 2h, or 1d. Minimum 10 seconds, maximum 30 days.');
      return interaction.editReply({ embeds: [err] });
    }

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const giveaway = {
      id,
      prize,
      rewardText: rewardText || null,
      rewardFile: rewardFile ? { url: rewardFile.url, name: rewardFile.name } : null,
      hostId: interaction.user.id,
      channelId: interaction.channelId,
      messageId: null,
      winnerCount,
      entries: [],
      createdAt: Date.now(),
      endsAt: Date.now() + time,
      ended: false,
      winners: []
    };

    const msg = await interaction.editReply({
      ...(await buildGiveawayPayload(giveaway)),
      fetchReply: true
    });

    giveaway.messageId = msg.id;
    const giveaways = loadGiveaways();
    giveaways[id] = giveaway;
    saveGiveaways(giveaways);
    scheduleGiveaway(giveaway);
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'id') return interaction.respond([]);

    const query = String(focused.value || '').toLowerCase();
    const giveaways = loadGiveaways();
    const choices = Object.values(giveaways)
      .filter(g => !g.ended && g.hostId === interaction.user.id)
      .filter(g => {
        const haystack = `${g.id} ${g.messageId || ''} ${g.prize || ''}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => a.endsAt - b.endsAt)
      .slice(0, 25)
      .map(g => ({
        name: `${g.prize || 'Mystery reward'} - ends ${new Date(g.endsAt).toLocaleString()}`.slice(0, 100),
        value: g.id
      }));

    return interaction.respond(choices);
  },

  async handleButton(interaction) {
    const [, giveawayId] = interaction.customId.split(':');
    const giveaways = loadGiveaways();
    const giveaway = giveaways[giveawayId];

    if (!giveaway) {
      return interaction.reply({ content: 'This giveaway is no longer active.', ephemeral: true });
    }

    if (giveaway.ended) {
      return interaction.reply({ content: 'This giveaway is no longer active.', ephemeral: true });
    }

    giveaway.entries ||= [];
    if (giveaway.entries.includes(interaction.user.id)) {
      return interaction.reply({ content: 'You are already entered in this giveaway.', ephemeral: true });
    }

    giveaway.entries.push(interaction.user.id);
    giveaways[giveawayId] = giveaway;
    saveGiveaways(giveaways);

    await interaction.update(await buildGiveawayPayload(giveaway));
    return interaction.followUp({ content: 'You joined the giveaway.', ephemeral: true }).catch(() => {});
  },

  init,
  endGiveaway: finalizeGiveaway
};







