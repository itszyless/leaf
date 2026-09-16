const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getUserEmbed } = require('../utils/getUserEmbed');

const pollsPath = path.join(__dirname, '..', 'data', 'polls.json');

function loadPolls() {
  try {
    if (!fs.existsSync(pollsPath)) return {};
    return JSON.parse(fs.readFileSync(pollsPath, 'utf8'));
  } catch {
    return {};
  }
}

function savePolls(data) {
  fs.writeFileSync(pollsPath, JSON.stringify(data, null, 2));
}

function parseChoices(input) {
  return input
    .split(/[,|]/g)
    .map(choice => choice.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function buildPollRows(poll) {
  const rows = [];
  let current = new ActionRowBuilder();

  poll.choices.forEach((choice, index) => {
    if (current.components.length === 5) {
      rows.push(current);
      current = new ActionRowBuilder();
    }

    current.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll:${poll.id}:${index}`)
        .setLabel(`${index + 1}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(Boolean(poll.closed))
    );
  });

  if (current.components.length > 0) rows.push(current);
  return rows;
}

function buildPollDescription(poll) {
  const votes = poll.votes || {};
  const total = Object.keys(votes).length;
  const counts = poll.choices.map((_, index) =>
    Object.values(votes).filter(vote => vote === index).length
  );

  const lines = poll.choices.map((choice, index) => {
    const count = counts[index];
    const percent = total === 0 ? 0 : Math.round((count / total) * 100);
    const voters = Object.entries(votes)
      .filter(([, vote]) => vote === index)
      .map(([userId]) => `<@${userId}>`);
    const voterText = !poll.anonymous && voters.length > 0
      ? `\n> ${voters.slice(0, 15).join(', ')}${voters.length > 15 ? ` and ${voters.length - 15} more` : ''}`
      : '';
    return `**${index + 1}. ${choice}** - ${count} vote${count === 1 ? '' : 's'} (${percent}%)${voterText}`;
  });

  return `${poll.question}\n\n${lines.join('\n')}\n\nTotal votes: **${total}**\nMode: **${poll.anonymous ? 'Anonymous' : 'Public voters'}**`;
}

async function buildPollMessagePayload(poll) {
  const embed = await getUserEmbed(poll.creatorId, 'Poll');
  embed
    .setTitle(poll.closed ? 'Poll Closed' : 'Poll')
    .setDescription(buildPollDescription(poll));

  return { embeds: [embed], components: buildPollRows(poll) };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a button poll.')
    .addStringOption(opt =>
      opt.setName('question')
        .setDescription('Poll question')
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption(opt =>
      opt.setName('choices')
        .setDescription('Comma-separated choices, 2 to 10 options')
        .setRequired(true)
        .setMaxLength(500)
    )
    .addBooleanOption(opt =>
      opt.setName('anonymous')
        .setDescription('Hide who voted from public view. Votes are still stored for one vote per user.')
        .setRequired(false)
    ),
  category: 'Utility',

  async execute(interaction) {
    const question = interaction.options.getString('question');
    const choices = parseChoices(interaction.options.getString('choices'));
    const anonymous = interaction.options.getBoolean('anonymous') ?? true;

    if (choices.length < 2) {
      const embed = await getUserEmbed(interaction.user.id, null, 'error');
      embed.setDescription('Please provide at least 2 choices, separated by commas.');
      return interaction.editReply({ embeds: [embed] });
    }

    const polls = loadPolls();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const poll = {
      id,
      question,
      choices,
      anonymous,
      creatorId: interaction.user.id,
      channelId: interaction.channelId,
      messageId: null,
      votes: {},
      closed: false,
      createdAt: Date.now()
    };

    const msg = await interaction.editReply({
      ...(await buildPollMessagePayload(poll)),
      fetchReply: true
    });

    poll.messageId = msg.id;
    polls[id] = poll;
    savePolls(polls);
  },

  async handleButton(interaction) {
    const [, pollId, rawIndex] = interaction.customId.split(':');
    const index = Number(rawIndex);
    const polls = loadPolls();
    const poll = polls[pollId];

    if (!poll || poll.closed) {
      return interaction.reply({ content: 'This poll is no longer active.', ephemeral: true });
    }

    if (!Number.isInteger(index) || index < 0 || index >= poll.choices.length) {
      return interaction.reply({ content: 'Invalid poll choice.', ephemeral: true });
    }

    poll.votes[interaction.user.id] = index;
    savePolls(polls);

    await interaction.update(await buildPollMessagePayload(poll));
    return interaction.followUp({
      content: `Your vote was saved for **${poll.choices[index]}**.`,
      ephemeral: true
    }).catch(() => {});
  }
};


