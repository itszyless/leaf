const { SlashCommandBuilder, ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const { getUserEmbed } = require('../utils/getUserEmbed');

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffleWord(word) {
  const letters = word.split('');
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const shuffled = letters.join('');
  return shuffled === word ? shuffleWord(word) : shuffled;
}

function emptyCell() { return '⬜'; }
const X_MARK = '❌';
const O_MARK = '⭕';

const wordBank = [
  'planet', 'silver', 'castle', 'rocket', 'winter', 'forest', 'shadow', 'button', 'dragon', 'coffee',
  'pirate', 'legend', 'galaxy', 'puzzle', 'stream', 'thunder', 'wizard', 'cookie', 'mirror', 'island',
  'diamond', 'monster', 'signal', 'danger', 'secret', 'orange', 'future', 'memory', 'camera', 'random',
];

const wordleWords = [
  'crane', 'slate', 'flame', 'ghost', 'pride', 'spark', 'dream', 'stone', 'chair', 'light',
  'plant', 'crown', 'baker', 'river', 'night', 'sound', 'magic', 'cloud', 'storm', 'smile',
  'grape', 'sword', 'beach', 'pixel', 'vapor', 'robot', 'quest', 'heart', 'music', 'tiger',
];

const hangmanWords = [
  { word: 'discord', hint: 'The app this bot lives in' },
  { word: 'javascript', hint: 'The language running this bot' },
  { word: 'minecraft', hint: 'Blocks, crafting, survival' },
  { word: 'roblox', hint: 'A platform with experiences and gamepasses' },
  { word: 'plus', hint: 'A paid plan or higher tier' },
  { word: 'weather', hint: 'Forecasts, wind, rain, and temperature' },
  { word: 'hangman', hint: 'The game you are playing right now' },
  { word: 'keyboard', hint: 'You type with it' },
  { word: 'internet', hint: 'The place where everything loads until it does not' },
  { word: 'treasure', hint: 'Pirates tend to look for it' },
];

function checkWinner(board, player) {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  return wins.some(line => line.every(i => board[i] === player));
}

function isDraw(board) {
  return board.every(cell => cell !== emptyCell());
}

function getEmptyIndices(board) {
  return board.map((v, i) => (v === emptyCell() ? i : -1)).filter(i => i !== -1);
}

function botMoveEasy(board) {
  const move = pick(getEmptyIndices(board));
  board[move] = O_MARK;
}

function botMoveNormal(board) {
  for (let i = 0; i < 9; i++) {
    if (board[i] === emptyCell()) {
      board[i] = O_MARK;
      if (checkWinner(board, O_MARK)) return;
      board[i] = emptyCell();
    }
  }

  for (let i = 0; i < 9; i++) {
    if (board[i] === emptyCell()) {
      board[i] = X_MARK;
      if (checkWinner(board, X_MARK)) {
        board[i] = O_MARK;
        return;
      }
      board[i] = emptyCell();
    }
  }

  botMoveEasy(board);
}

function minimax(board, isMaximizing) {
  if (checkWinner(board, O_MARK)) return { score: 10 };
  if (checkWinner(board, X_MARK)) return { score: -10 };
  if (isDraw(board)) return { score: 0 };

  const scores = [];
  for (const idx of getEmptyIndices(board)) {
    board[idx] = isMaximizing ? O_MARK : X_MARK;
    const result = minimax(board, !isMaximizing);
    scores.push({ idx, score: result.score });
    board[idx] = emptyCell();
  }

  return scores.reduce((best, current) => {
    if (!best) return current;
    return isMaximizing
      ? (current.score > best.score ? current : best)
      : (current.score < best.score ? current : best);
  }, null);
}

function botMoveHard(board) {
  const best = minimax(board, true);
  if (best) board[best.idx] = O_MARK;
}

function createBoardComponents(board) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_${idx}`)
          .setLabel(board[idx])
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(board[idx] !== emptyCell()),
      );
    }
    rows.push(row);
  }
  return rows;
}

function disabledRows(rows) {
  rows.forEach(row => row.components.forEach(button => button.setDisabled(true)));
  return rows;
}

function disabledBoard(board) {
  return disabledRows(createBoardComponents(board));
}

const rpsChoices = {
  rock: { emoji: '🪨', beats: 'scissors' },
  paper: { emoji: '📄', beats: 'rock' },
  scissors: { emoji: '✂️', beats: 'paper' },
};

function rpsBotChoice() {
  return pick(Object.keys(rpsChoices));
}

function rpsResult(player, bot) {
  if (player === bot) return 'draw';
  return rpsChoices[player].beats === bot ? 'win' : 'lose';
}

const wouldYouRather = [
  ['Always know when someone is lying', 'Always get away with lying'],
  ['Teleport anywhere once a day', 'Freeze time for 10 seconds once a day'],
  ['Only be able to whisper', 'Only be able to shout'],
  ['Have perfect luck in games', 'Have perfect timing in real life'],
  ['Never need sleep', 'Never need food'],
  ['Speak every language', 'Play every instrument'],
  ['Be famous for something silly', 'Be unknown but extremely rich'],
  ['Have one real-life undo button', 'Have one real-life pause button'],
  ['Live without music', 'Live without videos'],
  ['Win every argument', 'Never need to argue again'],
];

const truthPrompts = [
  'What is a harmless secret you have never told this chat?',
  'What is the most embarrassing typo you have sent?',
  'What is one thing you pretend to understand?',
  'What is your most irrational fear?',
  'What is a habit you know is weird but still do?',
  'What is the last thing you searched that sounds suspicious out of context?',
];

const darePrompts = [
  'Send your next message without using the letter e.',
  'Compliment the person above you.',
  'Type your next message like a dramatic movie villain.',
  'Let chat pick one word you must use in your next three messages.',
  'Send a sentence using only questions.',
  'Describe your day as patch notes.',
];

const neverHaveIEver = [
  'Never have I ever laughed at the worst possible moment.',
  'Never have I ever pretended to understand something and hoped nobody asked me about it.',
  'Never have I ever sent a message to the wrong person.',
  'Never have I ever stayed up way too late for absolutely no good reason.',
  'Never have I ever blamed lag when it was definitely my fault.',
  'Never have I ever opened an app and instantly forgot why.',
  'Never have I ever deleted a message immediately after sending it.',
  'Never have I ever practiced a conversation in my head and still fumbled it.',
  'Never have I ever clicked agree without reading anything.',
  'Never have I ever said one more game and played five more.',
];

function textGameControls(prefix, disabled = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}_guess`).setLabel('Guess').setStyle(ButtonStyle.Success).setDisabled(disabled),
  );

  if (prefix !== 'wordle') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`${prefix}_hint`).setLabel('Hint').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    );
  }

  if (prefix === 'unscramble') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`${prefix}_shuffle`).setLabel('Shuffle').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    );
  }

  row.addComponents(
    new ButtonBuilder().setCustomId(`${prefix}_giveup`).setLabel('Give Up').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );

  return [row];
}

function buildGuessModal(customId, title, label, minLength, maxLength) {
  const input = new TextInputBuilder()
    .setCustomId('guess')
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setMinLength(minLength)
    .setMaxLength(maxLength)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}
function randomCaptchaText(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function drawCaptcha(code) {
  const width = 420;
  const height = 170;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#151b26');
  gradient.addColorStop(1, '#222b3a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 55; i++) {
    ctx.fillStyle = `rgba(${80 + Math.random() * 120}, ${90 + Math.random() * 120}, ${130 + Math.random() * 100}, ${0.08 + Math.random() * 0.18})`;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(${90 + Math.random() * 120}, ${110 + Math.random() * 100}, ${180 + Math.random() * 60}, 0.22)`;
    ctx.lineWidth = 2 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, Math.random() * height);
    ctx.bezierCurveTo(Math.random() * width, Math.random() * height, Math.random() * width, Math.random() * height, Math.random() * width, Math.random() * height);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 58px Arial, sans-serif';
  const startX = width / 2 - ((code.length - 1) * 31);
  for (let i = 0; i < code.length; i++) {
    ctx.save();
    ctx.translate(startX + i * 62, height / 2 + (Math.random() * 12 - 6));
    ctx.rotate((Math.random() - 0.5) * 0.32);
    ctx.fillStyle = '#eef4ff';
    ctx.shadowColor = 'rgba(88, 101, 242, 0.5)';
    ctx.shadowBlur = 12;
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }

  return canvas.encode('png');
}

function captchaButtons(disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('captcha_solve').setLabel('Solve').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('captcha_skip').setLabel('Skip').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('captcha_stop').setLabel('Stop').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  )];
}

function buildCaptchaModal(customId) {
  const input = new TextInputBuilder()
    .setCustomId('captcha')
    .setLabel('Enter the captcha')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(12)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Solve Captcha')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function promptGuess(buttonInteraction, { prefix, title, label, minLength, maxLength }) {
  const modalId = `${prefix}_guess_modal_${buttonInteraction.id}`;
  await buttonInteraction.showModal(buildGuessModal(modalId, title, label, minLength, maxLength));
  const submitted = await buttonInteraction.awaitModalSubmit({
    time: 60000,
    filter: modal => modal.customId === modalId && modal.user.id === buttonInteraction.user.id,
  }).catch(() => null);

  if (!submitted) return null;
  const value = submitted.fields.getTextInputValue('guess').trim().toLowerCase();
  await submitted.deferUpdate().catch(() => {});
  return /^[a-z]+$/.test(value) ? value : '';
}

function renderHangman(word, guessed) {
  return word.split('').map(letter => guessed.has(letter) ? letter.toUpperCase() : '＿').join(' ');
}

function wordleLine(guess, answer) {
  const result = Array(5).fill('⬛');
  const remaining = answer.split('');

  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      result[i] = '🟩';
      remaining[i] = null;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === '🟩') continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx !== -1) {
      result[i] = '🟨';
      remaining[idx] = null;
    }
  }

  return `${result.join('')}  ${guess.toUpperCase()}`;
}

async function runWouldYouRather(interaction) {
  const pair = pick(wouldYouRather);
  const embed = await getUserEmbed(interaction.user.id, 'Would You Rather');
  embed.setDescription(`**A:** ${pair[0]}\n**B:** ${pair[1]}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wyr_a').setLabel('A').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wyr_b').setLabel('B').setStyle(ButtonStyle.Primary),
  );

  const votes = { a: new Set(), b: new Set() };
  const msg = await interaction.editReply({ embeds: [embed], components: [row] });
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

  collector.on('collect', async i => {
    const vote = i.customId === 'wyr_a' ? 'a' : 'b';
    votes.a.delete(i.user.id);
    votes.b.delete(i.user.id);
    votes[vote].add(i.user.id);

    const updated = await getUserEmbed(interaction.user.id, 'Would You Rather');
    updated.setDescription(
      `**A:** ${pair[0]}\nVotes: **${votes.a.size}**\n\n` +
      `**B:** ${pair[1]}\nVotes: **${votes.b.size}**`,
    );
    await i.update({ embeds: [updated], components: [row] });
  });

  collector.on('end', async () => {
    row.components.forEach(btn => btn.setDisabled(true));
    msg.edit({ components: [row] }).catch(() => {});
  });
}

async function runNeverHaveIEver(interaction) {
  const embed = await getUserEmbed(interaction.user.id, 'Never Have I Ever');
  embed.setDescription(pick(neverHaveIEver));
  return interaction.editReply({ embeds: [embed], components: [] });
}

async function runTruthOrDare(interaction) {
  const userId = interaction.user.id;
  const embed = await getUserEmbed(userId, 'Truth or Dare');
  embed.setDescription('Choose truth or dare.');

  const truthBtn = new ButtonBuilder().setCustomId('game_tod_truth').setLabel('Truth').setStyle(ButtonStyle.Primary);
  const dareBtn = new ButtonBuilder().setCustomId('game_tod_dare').setLabel('Dare').setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder().addComponents(truthBtn, dareBtn);
  const msg = await interaction.editReply({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
  collector.on('collect', async i => {
    if (i.user.id !== userId) return i.reply({ content: 'This is not your game.', ephemeral: true });
    truthBtn.setDisabled(true);
    dareBtn.setDisabled(true);
    const result = i.customId === 'game_tod_truth' ? pick(truthPrompts) : pick(darePrompts);
    const resultEmbed = await getUserEmbed(userId, 'Truth or Dare');
    resultEmbed.setDescription(result);
    await i.update({ embeds: [resultEmbed], components: [row] });
    collector.stop();
  });
  collector.on('end', () => {
    truthBtn.setDisabled(true);
    dareBtn.setDisabled(true);
    msg.edit({ components: [row] }).catch(() => {});
  });
}
async function runTtt(interaction) {
  const difficulty = interaction.options.getString('difficulty');
  const board = Array(9).fill(emptyCell());
  const embed = await getUserEmbed(interaction.user.id, 'Tic Tac Toe');
  embed.setDescription('Your turn. Click a square to place ❌.');
  const msg = await interaction.editReply({ embeds: [embed], components: createBoardComponents(board) });
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120000,
    filter: i => i.user.id === interaction.user.id && i.customId.startsWith('ttt_'),
  });

  collector.on('collect', async i => {
    await i.deferUpdate();
    const idx = Number(i.customId.split('_')[1]);
    if (board[idx] !== emptyCell()) return;

    board[idx] = X_MARK;
    if (checkWinner(board, X_MARK)) {
      collector.stop('done');
      const winEmbed = await getUserEmbed(interaction.user.id, 'Tic Tac Toe');
      winEmbed.setDescription('You won! 🎉');
      return interaction.editReply({ embeds: [winEmbed], components: disabledBoard(board) });
    }

    if (isDraw(board)) {
      collector.stop('done');
      const drawEmbed = await getUserEmbed(interaction.user.id, 'Tic Tac Toe');
      drawEmbed.setDescription("It's a draw! 🤝");
      return interaction.editReply({ embeds: [drawEmbed], components: disabledBoard(board) });
    }

    const thinkingEmbed = await getUserEmbed(interaction.user.id, 'Tic Tac Toe');
    thinkingEmbed.setDescription('Bot is thinking...');
    await interaction.editReply({ embeds: [thinkingEmbed], components: [] });
    await new Promise(resolve => setTimeout(resolve, 700));

    if (difficulty === 'easy') botMoveEasy(board);
    else if (difficulty === 'normal') botMoveNormal(board);
    else botMoveHard(board);

    if (checkWinner(board, O_MARK)) {
      collector.stop('done');
      const loseEmbed = await getUserEmbed(interaction.user.id, 'Tic Tac Toe');
      loseEmbed.setDescription('You lost! 😢');
      return interaction.editReply({ embeds: [loseEmbed], components: disabledBoard(board) });
    }

    if (isDraw(board)) {
      collector.stop('done');
      const drawEmbed = await getUserEmbed(interaction.user.id, 'Tic Tac Toe');
      drawEmbed.setDescription("It's a draw! 🤝");
      return interaction.editReply({ embeds: [drawEmbed], components: disabledBoard(board) });
    }

    const turnEmbed = await getUserEmbed(interaction.user.id, 'Tic Tac Toe');
    turnEmbed.setDescription('Your turn. Click a square to place ❌.');
    return interaction.editReply({ embeds: [turnEmbed], components: createBoardComponents(board) });
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'time') return;
    const timeoutEmbed = await getUserEmbed(interaction.user.id, 'Tic Tac Toe');
    timeoutEmbed.setDescription('Game timed out. Start a new game when you are ready.');
    await interaction.editReply({ embeds: [timeoutEmbed], components: disabledBoard(board) }).catch(() => {});
  });
}

async function runRps(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rps_rock').setLabel('Rock').setEmoji('🪨').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps_paper').setLabel('Paper').setEmoji('📄').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps_scissors').setLabel('Scissors').setEmoji('✂️').setStyle(ButtonStyle.Primary),
  );

  const embed = await getUserEmbed(interaction.user.id, 'Rock Paper Scissors');
  embed.setDescription('Choose your move:');
  const msg = await interaction.editReply({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
    max: 1,
    filter: i => i.user.id === interaction.user.id && i.customId.startsWith('rps_'),
  });

  collector.on('collect', async i => {
    await i.deferUpdate();
    const playerChoice = i.customId.split('_')[1];
    const botChoice = rpsBotChoice();
    const result = rpsResult(playerChoice, botChoice);
    const resultText = result === 'win' ? 'You won! 🎉' : result === 'lose' ? 'You lost! 😢' : "It's a draw! 🤝";

    const resultEmbed = await getUserEmbed(interaction.user.id, 'Rock Paper Scissors');
    resultEmbed.setDescription(
      `You chose ${rpsChoices[playerChoice].emoji} **${playerChoice}**\n` +
      `Bot chose ${rpsChoices[botChoice].emoji} **${botChoice}**\n\n` +
      `**${resultText}**`,
    );
    return interaction.editReply({ embeds: [resultEmbed], components: [] });
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'time') return;
    const timeoutEmbed = await getUserEmbed(interaction.user.id, 'Rock Paper Scissors');
    timeoutEmbed.setDescription('Game timed out. Start a new game when you are ready.');
    await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
  });
}


async function runCaptcha(interaction) {
  const userId = interaction.user.id;
  const durationMs = 60000;
  const startedAt = Date.now();
  const stats = { correct: 0, incorrect: 0, skipped: 0 };
  let round = 1;
  let code = randomCaptchaText();
  let done = false;

  function secondsLeft() {
    return Math.max(0, Math.ceil((durationMs - (Date.now() - startedAt)) / 1000));
  }

  async function render(title = 'Captcha') {
    const buffer = await drawCaptcha(code);
    const attachment = new AttachmentBuilder(buffer, { name: 'captcha.png' });
    const embed = await getUserEmbed(userId, title);
    embed
      .setDescription(
        `Round **${round}** • Time left: **${secondsLeft()}s**\n` +
        `Correct: **${stats.correct}** • Incorrect: **${stats.incorrect}** • Skipped: **${stats.skipped}**\n\n` +
        'Press **Solve** and type the characters shown in the image.',
      )
      .setImage('attachment://captcha.png')
      .setFooter({ text: `60 seconds total. ${secondsLeft()} seconds left. Only you can play this captcha.` });
    return { embed, attachment };
  }

  async function finish(reason = 'Captcha Finished') {
    done = true;
    collector.stop('done');
    const played = stats.correct + stats.incorrect + stats.skipped;
    const accuracy = played ? Math.round((stats.correct / played) * 100) : 0;
    const embed = await getUserEmbed(userId, reason);
    embed.setDescription(
      `Rounds: **${played}**\n` +
      `Correct: **${stats.correct}**\n` +
      `Incorrect: **${stats.incorrect}**\n` +
      `Skipped: **${stats.skipped}**\n` +
      `Accuracy: **${accuracy}%**`,
    );
    return interaction.editReply({ embeds: [embed], components: captchaButtons(true), files: [] }).catch(() => {});
  }

  async function nextRound(title = 'Captcha') {
    if (secondsLeft() <= 0) return finish('Captcha Time Up');
    round += 1;
    code = randomCaptchaText();
    const { embed, attachment } = await render(title);
    return interaction.editReply({ embeds: [embed], components: captchaButtons(), files: [attachment] });
  }

  const first = await render();
  const msg = await interaction.editReply({ embeds: [first.embed], components: captchaButtons(), files: [first.attachment] });
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: durationMs });

  collector.on('collect', async i => {
    if (i.user.id !== userId) return i.reply({ content: 'This is not your captcha.', ephemeral: true });
    if (done) return;

    if (i.customId === 'captcha_stop') {
      await i.deferUpdate().catch(() => {});
      return finish('Captcha Stopped');
    }

    if (i.customId === 'captcha_skip') {
      await i.deferUpdate().catch(() => {});
      stats.skipped += 1;
      return nextRound('Captcha Skipped');
    }

    if (i.customId === 'captcha_solve') {
      const modalId = `captcha_modal_${i.id}`;
      await i.showModal(buildCaptchaModal(modalId));
      const submitted = await i.awaitModalSubmit({
        time: Math.min(30000, secondsLeft() * 1000),
        filter: modal => modal.customId === modalId && modal.user.id === userId,
      }).catch(() => null);
      if (!submitted || done) return;

      const answer = submitted.fields.getTextInputValue('captcha').trim().replace(/\s+/g, '');
      if (answer === code) stats.correct += 1;
      else stats.incorrect += 1;
      await submitted.deferUpdate().catch(() => {});
      return nextRound(answer === code ? 'Captcha Correct' : 'Captcha Incorrect');
    }
  });

  collector.on('end', async (_, reason) => {
    if (done || reason === 'done') return;
    await finish('Captcha Time Up');
  });
}
async function runHangman(interaction) {
  const item = pick(hangmanWords);
  const word = item.word.toLowerCase();
  const guessed = new Set();
  const wrong = new Set();
  let hints = 1;
  let done = false;

  const render = async (title = 'Hangman') => {
    const embed = await getUserEmbed(interaction.user.id, title);
    embed.setDescription(
      `${renderHangman(word, guessed)}\n\n` +
      `❤️ Lives: **${6 - wrong.size}/6**\n` +
      `❌ Wrong: ${wrong.size ? [...wrong].map(l => l.toUpperCase()).join(', ') : 'None'}\n` +
      `💡 Hint: ${hints ? 'available' : item.hint}`,
    );
    embed.setFooter({ text: `Press Guess. Enter 1-${word.length} letters.` });
    return embed;
  };

  const msg = await interaction.editReply({ embeds: [await render()], components: textGameControls('hangman') });
  const buttonCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000 });

  async function finish(title, description) {
    done = true;
    buttonCollector.stop('done');
    const embed = await getUserEmbed(interaction.user.id, title);
    embed.setDescription(description);
    return interaction.editReply({ embeds: [embed], components: textGameControls('hangman', true) });
  }

  async function applyGuess(rawGuess) {
    if (!rawGuess || rawGuess.length < 1 || rawGuess.length > word.length) {
      const embed = await render('Hangman');
      embed.addFields({ name: 'Invalid guess', value: `Use letters only, 1-${word.length} characters.`, inline: false });
      return interaction.editReply({ embeds: [embed], components: textGameControls('hangman') });
    }

    const guess = rawGuess.toLowerCase();
    if (guess.length === 1) {
      if (word.includes(guess)) guessed.add(guess);
      else wrong.add(guess);
    } else if (guess === word) {
      word.split('').forEach(l => guessed.add(l));
    } else {
      wrong.add(guess.slice(0, 1));
    }

    if (word.split('').every(l => guessed.has(l))) {
      return finish('Hangman Won', `You guessed it: **${word.toUpperCase()}** 🎉`);
    }
    if (wrong.size >= 6) {
      return finish('Hangman Lost', `Out of lives. The word was **${word.toUpperCase()}**.`);
    }
    return interaction.editReply({ embeds: [await render()], components: textGameControls('hangman') });
  }

  buttonCollector.on('collect', async i => {
    if (i.user.id !== interaction.user.id) return i.reply({ content: 'This is not your game.', ephemeral: true });
    if (done) return;

    if (i.customId === 'hangman_guess') {
      const guess = await promptGuess(i, {
        prefix: 'hangman',
        title: 'Hangman Guess',
        label: `Letter or full word (max ${word.length})`,
        minLength: 1,
        maxLength: word.length,
      });
      if (guess === null) return;
      return applyGuess(guess);
    }

    await i.deferUpdate();
    if (i.customId === 'hangman_giveup') return finish('Hangman', `You gave up. The word was **${word.toUpperCase()}**.`);
    if (i.customId === 'hangman_hint') {
      if (hints > 0) hints--;
      return interaction.editReply({ embeds: [await render('Hangman Hint')], components: textGameControls('hangman') });
    }
  });

  buttonCollector.on('end', async (_, reason) => {
    if (done || reason === 'done') return;
    await finish('Hangman', `Game timed out. The word was **${word.toUpperCase()}**.`).catch(() => {});
  });
}
async function runUnscramble(interaction) {
  const word = pick(wordBank).toLowerCase();
  let scrambled = shuffleWord(word);
  let hints = 2;
  let done = false;

  const render = async (title = 'Unscramble') => {
    const embed = await getUserEmbed(interaction.user.id, title);
    embed.setDescription(
      `Unscramble this word:\n\n` +
      `# ${scrambled.toUpperCase().split('').join(' ')}` +
      `\n\nLength: **${word.length}** • Hints left: **${hints}**`,
    );
    embed.setFooter({ text: `Press Guess. Enter ${word.length} letters.` });
    return embed;
  };

  const msg = await interaction.editReply({ embeds: [await render()], components: textGameControls('unscramble') });
  const buttonCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

  async function finish(title, description) {
    done = true;
    buttonCollector.stop('done');
    const embed = await getUserEmbed(interaction.user.id, title);
    embed.setDescription(description);
    return interaction.editReply({ embeds: [embed], components: textGameControls('unscramble', true) });
  }

  async function applyGuess(rawGuess) {
    if (!rawGuess || rawGuess.length < 1 || rawGuess.length > word.length) {
      const embed = await render('Unscramble');
      embed.addFields({ name: 'Invalid guess', value: `Use letters only, 1-${word.length} characters.`, inline: false });
      return interaction.editReply({ embeds: [embed], components: textGameControls('unscramble') });
    }

    if (rawGuess === word) return finish('Unscramble Won', `Correct! The word was **${word.toUpperCase()}** 🎉`);

    const embed = await render('Unscramble');
    embed.addFields({ name: 'Last guess', value: `**${rawGuess.toUpperCase()}** was not it.`, inline: false });
    return interaction.editReply({ embeds: [embed], components: textGameControls('unscramble') });
  }

  buttonCollector.on('collect', async i => {
    if (i.user.id !== interaction.user.id) return i.reply({ content: 'This is not your game.', ephemeral: true });
    if (done) return;

    if (i.customId === 'unscramble_guess') {
      const guess = await promptGuess(i, {
        prefix: 'unscramble',
        title: 'Unscramble Guess',
        label: `Your answer (max ${word.length})`,
        minLength: 1,
        maxLength: word.length,
      });
      if (guess === null) return;
      return applyGuess(guess);
    }

    await i.deferUpdate();
    if (i.customId === 'unscramble_giveup') return finish('Unscramble', `You gave up. The word was **${word.toUpperCase()}**.`);
    if (i.customId === 'unscramble_shuffle') scrambled = shuffleWord(word);
    if (i.customId === 'unscramble_hint' && hints > 0) {
      hints--;
      const reveal = word.slice(0, Math.min(word.length, 3 - hints));
      const embed = await render('Unscramble Hint');
      embed.addFields({ name: 'Hint', value: `Starts with **${reveal.toUpperCase()}**`, inline: false });
      return interaction.editReply({ embeds: [embed], components: textGameControls('unscramble') });
    }

    return interaction.editReply({ embeds: [await render()], components: textGameControls('unscramble') });
  });

  buttonCollector.on('end', async (_, reason) => {
    if (done || reason === 'done') return;
    await finish('Unscramble', `Game timed out. The word was **${word.toUpperCase()}**.`).catch(() => {});
  });
}
async function runWordle(interaction) {
  const answer = pick(wordleWords).toLowerCase();
  const guesses = [];
  let done = false;

  const render = async (title = 'Wordle') => {
    const embed = await getUserEmbed(interaction.user.id, title);
    const board = guesses.length
      ? guesses.map(guess => wordleLine(guess, answer)).join('\n')
      : '⬛⬛⬛⬛⬛';
    embed.setDescription(
      `${board}\n\n` +
      `Attempts: **${guesses.length}/6**\n` +
      `Press Guess and enter a **5-letter word**.`,
    );
    embed.setFooter({ text: 'Green = correct spot, yellow = wrong spot, black = not in word.' });
    return embed;
  };

  const msg = await interaction.editReply({ embeds: [await render()], components: textGameControls('wordle') });
  const buttonCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000 });

  async function finish(title, description) {
    done = true;
    buttonCollector.stop('done');
    const embed = await getUserEmbed(interaction.user.id, title);
    embed.setDescription(description);
    return interaction.editReply({ embeds: [embed], components: textGameControls('wordle', true) });
  }

  async function applyGuess(rawGuess) {
    if (!rawGuess || rawGuess.length !== 5) {
      const embed = await render('Wordle');
      embed.addFields({ name: 'Invalid guess', value: 'Use letters only, exactly 5 characters.', inline: false });
      return interaction.editReply({ embeds: [embed], components: textGameControls('wordle') });
    }

    guesses.push(rawGuess);
    if (rawGuess === answer) {
      return finish('Wordle Won', `${guesses.map(g => wordleLine(g, answer)).join('\n')}\n\nYou got it in **${guesses.length}** tries 🎉`);
    }

    if (guesses.length >= 6) {
      return finish('Wordle Lost', `${guesses.map(g => wordleLine(g, answer)).join('\n')}\n\nThe word was **${answer.toUpperCase()}**.`);
    }

    return interaction.editReply({ embeds: [await render()], components: textGameControls('wordle') });
  }

  buttonCollector.on('collect', async i => {
    if (i.user.id !== interaction.user.id) return i.reply({ content: 'This is not your game.', ephemeral: true });
    if (done) return;

    if (i.customId === 'wordle_guess') {
      const guess = await promptGuess(i, {
        prefix: 'wordle',
        title: 'Wordle Guess',
        label: '5-letter word',
        minLength: 5,
        maxLength: 5,
      });
      if (guess === null) return;
      return applyGuess(guess);
    }

    await i.deferUpdate();
    if (i.customId === 'wordle_giveup') return finish('Wordle', `You gave up. The word was **${answer.toUpperCase()}**.`);
  });

  buttonCollector.on('end', async (_, reason) => {
    if (done || reason === 'done') return;
    await finish('Wordle', `Game timed out. The word was **${answer.toUpperCase()}**.`).catch(() => {});
  });
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('Small interactive games')
    .addSubcommand(sub =>
      sub
        .setName('ttt')
        .setDescription('Play Tic Tac Toe vs bot')
        .addStringOption(opt =>
          opt
            .setName('difficulty')
            .setDescription('Bot difficulty')
            .setRequired(true)
            .addChoices(
              { name: 'Easy', value: 'easy' },
              { name: 'Normal', value: 'normal' },
              { name: 'Hard', value: 'hard' },
            ),
        ),
    )
    .addSubcommand(sub => sub.setName('rps').setDescription('Play Rock Paper Scissors vs bot'))
    .addSubcommand(sub => sub.setName('wouldyourather').setDescription('Get a would-you-rather prompt with voting buttons'))
    .addSubcommand(sub => sub.setName('neverhaveiever').setDescription('Get a never-have-I-ever prompt'))
    .addSubcommand(sub => sub.setName('truthordare').setDescription('Play Truth or Dare with buttons'))
    .addSubcommand(sub => sub.setName('hangman').setDescription('Guess the hidden word with modal guesses'))
    .addSubcommand(sub => sub.setName('unscramble').setDescription('Unscramble a shuffled word'))
    .addSubcommand(sub => sub.setName('wordle').setDescription('Guess a five-letter word in six tries'))
    .addSubcommand(sub => sub.setName('captcha').setDescription('Solve endless captcha images for 60 seconds')),
  category: 'Games',

  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: false });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'ttt') return runTtt(interaction);
    if (sub === 'rps') return runRps(interaction);
    if (sub === 'wouldyourather') return runWouldYouRather(interaction);
    if (sub === 'neverhaveiever') return runNeverHaveIEver(interaction);
    if (sub === 'truthordare') return runTruthOrDare(interaction);
    if (sub === 'hangman') return runHangman(interaction);
    if (sub === 'unscramble') return runUnscramble(interaction);
    if (sub === 'wordle') return runWordle(interaction);
    if (sub === 'captcha') return runCaptcha(interaction);

    const embed = await getUserEmbed(interaction.user.id, null, 'error');
    embed.setDescription('Unknown game.');
    return interaction.editReply({ embeds: [embed], components: [] });
  },
};










