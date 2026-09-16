const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");

const currency = "Cash";

const fs = require("fs");
const path = require("path");
const ecoPath = path.join(__dirname, "../data/economy.json");
const plusPath = path.join(__dirname, "../data/plusUsers.json");
const upgradesPath = path.join(__dirname, "../data/upgrades.json");
const stockPath = path.join(__dirname, "../data/stocks.json");
const betsPath = path.join(__dirname, "../data/stockBets.json");

const { getUserEmbed } = require("../utils/getUserEmbed");
const { getUserLanguage } = require("../utils/langStorage");
const { translateText } = require("../utils/translator");
const { abbreviate } = require("../utils/abbreviate");
const { buyTickets, status: lotteryStatus, TICKET_COST, MAX_TICKETS } = require("../utils/lotteryRunner");

// ---------- Helpers ----------
function msToPretty(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function parseEcoAmountInput(input, max = 0) {
  const raw = String(input ?? '').trim().toLowerCase().replace(/,/g, '');
  if (raw === 'all') return Math.max(0, Math.floor(Number(max || 0)));
  const match = raw.match(/^(\d+(?:\.\d+)?)(k|m|b|t|q)?$/i);
  if (!match) return NaN;
  const multipliers = { k: 1e3, m: 1e6, b: 1e9, t: 1e12, q: 1e15 };
  const amount = Number(match[1]) * (multipliers[match[2]] || 1);
  return Number.isFinite(amount) ? Math.floor(amount) : NaN;
}

function initUser(data, id) {
  if (!data[id]) {
    data[id] = {
      cash: 0,
      bank: 0,
      lastWork: 0,
      lastDaily: 0,
      lastBeg: 0,
      lastBonus: 0,
      lastMonthlyPlus: 0,
      joinedBonus: false,
      upgrades: [],
      passive: {
        sources: [],
        lastPayout: 0,
      },
    };
  } else {
    // backfill fields for users created before upgrades existed
    if (!Array.isArray(data[id].upgrades)) data[id].upgrades = [];
    if (!data[id].passive) {
      data[id].passive = {
        sources: [],
        lastPayout: 0,
      };
    } else {
      if (!data[id].passive.lastPayout) data[id].passive.lastPayout = 0;
    }
    if (typeof data[id].lastWork !== "number") data[id].lastWork = 0;
    if (typeof data[id].lastDaily !== "number") data[id].lastDaily = 0;
    if (typeof data[id].lastBeg !== "number") data[id].lastBeg = 0;
    if (typeof data[id].lastBonus !== "number") data[id].lastBonus = 0;
    if (typeof data[id].lastMonthlyPlus !== "number") data[id].lastMonthlyPlus = 0;
    if (typeof data[id].joinedBonus !== "boolean") data[id].joinedBonus = false;
    if (typeof data[id].cash !== "number") data[id].cash = 0;
    if (typeof data[id].bank !== "number") data[id].bank = 0;
  }
  return data[id];
}

function save(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function loadStocks() {
  if (!fs.existsSync(stockPath)) save(stockPath, {});
  return JSON.parse(fs.readFileSync(stockPath, "utf8"));
}

function loadBets() {
  if (!fs.existsSync(betsPath)) save(betsPath, { active: [], history: [] });
  return JSON.parse(fs.readFileSync(betsPath, "utf8"));
}

// Generates a random % change and direction, optionally influenced by an event
function generateStockChange(eventBias, history = []) {
  const baseAvg = history.length
    ? history.reduce((a, b) => a + b, 0) / history.length
    : 0;
  const baseDir = baseAvg >= 0 ? "up" : "down";
  const volatility = history.length
    ? Math.sqrt(
        history.map((h) => (h - baseAvg) ** 2).reduce((a, b) => a + b, 0) /
          history.length,
      )
    : 10;

  // Weighted random accuracy: 60 % general correctness
  const accuracyChance = 0.6;
  const finalDir =
    Math.random() < accuracyChance ? baseDir : baseDir === "up" ? "down" : "up";

  let change =
    Math.abs(baseAvg) * (1 + Math.random() * 0.4) +
    volatility * (Math.random() - 0.5);
  if (eventBias === "up") change *= 1.2;
  else if (eventBias === "down") change *= -1.2;
  else change *= finalDir === "up" ? 1 : -1;

  change = Math.max(-25, Math.min(change, 25));

  return Number(change.toFixed(2));
}

function msToPrettyShort(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${m}m ${s}s`;
}

function loadUpgrades() {
  if (!fs.existsSync(upgradesPath)) return {};
  return JSON.parse(fs.readFileSync(upgradesPath, "utf8"));
}

// return the strongest work % bonus upgrade the user owns
function getWorkBonusPercent(userData) {
  const allUpgrades = loadUpgrades();
  let best = 0;
  for (const upId of userData.upgrades || []) {
    const def = allUpgrades[upId];
    if (def && typeof def.bonusWorkPercent === "number") {
      if (def.bonusWorkPercent > best) best = def.bonusWorkPercent;
    }
  }
  return best; // e.g. 50
}

function getGambleLuckBonusPercent(userData) {
  const allUpgrades = loadUpgrades();
  let best = 0;
  for (const upId of userData.upgrades || []) {
    const def = allUpgrades[upId];
    if (def && typeof def.bonusLuckPercent === "number") {
      if (def.bonusLuckPercent > best) best = def.bonusLuckPercent;
    }
  }
  return best; // e.g. 20
}

// pay all passive incomes from all owned miner upgrades
function applyPassiveIncomeForUser(userData) {
  if (
    !userData.passive ||
    !userData.passive.sources ||
    !userData.passive.sources.length
  )
    return;

  const now = Date.now();
  const HOURLY = 60 * 60 * 1000; // 1 hour

  if (!userData.passive.lastPayout || userData.passive.lastPayout === 0) {
    userData.passive.lastPayout = now;
    return;
  }

  const elapsed = now - userData.passive.lastPayout;
  if (elapsed < HOURLY) return; // less than an hour passed

  const hoursPassed = Math.floor(elapsed / HOURLY);
  if (hoursPassed <= 0) return;

  // sum all passive sources
  let totalIncome = 0;
  for (const src of userData.passive.sources) {
    const hourly = src.incomePerHour || 0;
    totalIncome += hourly * hoursPassed;
  }

  if (totalIncome > 0) {
    userData.cash += totalIncome;
    userData.passive.lastPayout += hoursPassed * HOURLY;
  }
}

async function updateStocksIfNeeded() {
  const stocks = loadStocks();
  const bets = loadBets();
  const now = Date.now();

  const discord = stocks.discord || {
    price: 1200,
    direction: "up",
    lastChange: 0,
    history: [],
    nextUpdate: 0,
    event: null,
  };

  if (!discord.nextUpdate || now >= discord.nextUpdate) {
    // random event 5–10% chance
    const eventChance = Math.random();
    let event = null;
    let bias = null;
    if (eventChance < 0.1) {
      const events = [
        ["Discord Inc. launches Nitro update! ??", "up"],
        ["Server outage hits Discord Inc. ??", "down"],
        ["Investors unsure about new features ??", null],
        ["Discord Inc. partners with major streamer ??", "up"],
        ["Data leak rumors affect reputation ??", "down"],
      ];
      [event, bias] = events[Math.floor(Math.random() * events.length)];
    }

    const change = generateStockChange(bias, discord.history);
    discord.price = Math.max(
      100,
      Number((discord.price * (1 + change / 100)).toFixed(2)),
    );
    discord.direction = change > 0 ? "up" : "down";
    discord.lastChange = change;
    discord.event = event;
    discord.history.unshift(change);
    if (discord.history.length > 3) discord.history.pop();
    discord.nextUpdate = now + 60 * 60 * 1000;

    stocks.discord = discord;
    save(stockPath, stocks);

    // Resolve all active bets
    if (bets.active.length) {
      const eco = JSON.parse(fs.readFileSync(ecoPath, "utf8"));
      const resolved = [];

      for (const bet of bets.active) {
        const userData = initUser(eco, bet.user);
        const correct = discord.direction === bet.direction;
        const gain = correct ? bet.amount : -bet.amount;
        userData.cash += correct ? bet.amount * 2 : 0;

        // add stats
        userData.stockStats ??= { bets: [], totalBets: 0, wins: 0, losses: 0 };
        userData.stockStats.totalBets++;
        if (correct) userData.stockStats.wins++;
        else userData.stockStats.losses++;

        userData.stockStats.bets.unshift({
          timestamp: now,
          direction: bet.direction,
          amount: bet.amount,
          result: correct ? "win" : "loss",
          gain: correct ? bet.amount : -bet.amount,
        });
        if (userData.stockStats.bets.length > 5) userData.stockStats.bets.pop();

        // try DM user
        try {
          const user = await global.client.users.fetch(bet.user);
          const lang = getUserLanguage(user.id) || "en";
          const e = await getUserEmbed(
            user.id,
            correct ? "Stock Win!" : "Stock Lost",
          );
          const amountDisplay = `${gain > 0 ? "+" : "-"}${abbreviate(Math.abs(gain), "prefix")} ${currency}`;

          const tran_1 = await translateText(
            "You predicted correctly! Discord Inc. moved",
            lang,
          );
          const tran_2 = await translateText(
            "Your prediction was wrong. Discord Inc. moved",
            lang,
          );
          const tran_3 = await translateText("You won", lang);
          const tran_4 = await translateText("You lost", lang);

          e.setDescription(
            correct
              ? `${tran_1} ${discord.direction}. ${tran_3} **${amountDisplay}**!`
              : `${tran_2} ${discord.direction}. ${tran_4} **${amountDisplay}**.`,
            lang,
          );
          await user.send({ embeds: [e] });
        } catch {
          // ignore DM fails
        }

        resolved.push(bet);
      }

      bets.history.push(...resolved.map((r) => ({ ...r, resolvedAt: now })));
      bets.active = [];
      save(betsPath, bets);
      save(ecoPath, eco);
    }
  }
}

// ---------- Command ----------
module.exports = {
  updateStocksIfNeeded,
  data: new SlashCommandBuilder()
    .setName("eco")
    .setDescription("leaf economy system")
    .addSubcommand((sub) =>
      sub
        .setName("bal")
        .setDescription("Check balance")
        .addUserOption((opt) => opt.setName("user").setDescription("User")),
    )
    .addSubcommand((sub) =>
      sub.setName("work").setDescription("Work for random cash"),
    )    .addSubcommand((sub) =>
      sub.setName("daily").setDescription("Claim daily reward"),
    )
    .addSubcommand((sub) =>
      sub.setName("bonus").setDescription("Claim a random bonus reward"),
    )
    .addSubcommand((sub) =>
      sub.setName("joinbonus").setDescription("Claim your one-time join bonus"),
    )
    .addSubcommand((sub) =>
      sub.setName("monthlyplus").setDescription("\u2728 Claim your monthly Plus cash reward"),
    )
    .addSubcommand((sub) =>
      sub.setName("cooldowns").setDescription("Check your economy cooldowns"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("deposit")
        .setDescription("Deposit cash to bank")
        .addStringOption((opt) =>
          opt
            .setName("amount")
            .setDescription('Amount, e.g. all, 500k, 100.5m')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("withdraw")
        .setDescription("Withdraw cash from bank")
        .addStringOption((opt) =>
          opt
            .setName("amount")
            .setDescription('Amount, e.g. all, 500k, 100.5m')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("profile")
        .setDescription("Check profile stats")
        .addUserOption((opt) => opt.setName("user").setDescription("User")),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("lottery")
        .setDescription("Global lottery tickets")
        .addSubcommand((sub) => sub.setName("status").setDescription("Check the current lottery"))
        .addSubcommand((sub) =>
          sub
            .setName("buy")
            .setDescription("Buy lottery tickets")
            .addIntegerOption((opt) =>
              opt
                .setName("tickets")
                .setDescription("Tickets to buy (max 10)")
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("stock")
        .setDescription("Stock trading and predictions")
        .addSubcommand((s) =>
          s.setName("view").setDescription("View current Discord Inc. stock"),
        )
        .addSubcommand((s) =>
          s
            .setName("bet")
            .setDescription("Bet on Discord Inc. price movement")
            .addStringOption((o) =>
              o.setName("amount")
                .setDescription('Bet amount, e.g. all, 500k, 100.5m')
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("analyze")
            .setDescription("Get an expert analysis on Discord Inc."),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("transfer")
        .setDescription("Transfer cash to a user")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User").setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("amount").setDescription('Amount, e.g. all, 500k, 100.5m').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("leaderboard").setDescription("Top users"),
    )
    .addSubcommand((sub) =>
      sub.setName("beg").setDescription("Beg for a few cash"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("passive-income")
        .setDescription("Check your next passive income payout timer"),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("upgrades")
        .setDescription("View and buy upgrades")
        .addSubcommand((s) =>
          s
            .setName("list")
            .setDescription("Show the upgrades you own and the next ones"),
        )
        .addSubcommand((s) =>
          s.setName("shop").setDescription("Browse all upgrades (paged)"),
        )
        .addSubcommand((s) =>
          s
            .setName("buy")
            .setDescription("Buy the next upgrade")
            .addStringOption((o) =>
              o
                .setName("item")
                .setDescription("Upgrade ID to buy")
                .setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("game")
        .setDescription("Economy games")
        .addSubcommand((sub) =>
          sub
            .setName("gamble")
            .setDescription("Simple 50/50 gamble")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Amount, e.g. all, 500k, 100.5m').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("roulette")
            .setDescription("Bet on red, black or green")
            .addStringOption((opt) =>
              opt
                .setName("color")
                .setDescription("Choose red, black or green")
                .setRequired(true)
                .addChoices(
                  { name: "Red (47.5% - 2x)", value: "red" },
                  { name: "Black (47.5% - 2x)", value: "black" },
                  { name: "Green (5% - 14x)", value: "green" },
                ),
            )
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Amount, e.g. all, 500k, 100.5m').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("slots")
            .setDescription("Play the slot machine")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("crash")
            .setDescription("Play the crash game")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("mines")
            .setDescription("Play the mines game")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("mines")
                .setDescription("Number of mines (1-5)")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("scratch")
            .setDescription("Play a scratch card")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("horse")
            .setDescription("Bet on a horse race")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("horse")
                .setDescription("Horse to bet on")
                .setRequired(true)
                .addChoices(
                  { name: "Blaze", value: 0 },
                  { name: "Comet", value: 1 },
                  { name: "Nova", value: 2 },
                  { name: "Viper", value: 3 },
                  { name: "Echo", value: 4 },
                ),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("plinko")
            .setDescription("Play the plinko game")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("slots")
                .setDescription("Number of slots (6-9)")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("tower")
            .setDescription("Play the tower game")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("columns")
                .setDescription("Number of columns (3-5)")
                .setRequired(false),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("levels")
                .setDescription("Number of levels (3-10)")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("keno")
            .setDescription("Play the keno game")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("hilo")
            .setDescription("Play the hilo game")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("dice")
            .setDescription("Play the dice game")
            .addStringOption((opt) =>
              opt.setName("amount").setDescription('Bet amount, e.g. all, 500k, 100.5m').setRequired(true),
            ),
        ),
    ),  category: "Economy",

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const subGroup = interaction.options.getSubcommandGroup(false); // may be null if not in group
    const userId = interaction.user.id;
    const lang = getUserLanguage(userId) || "en";

    // load economy data
    let data = fs.existsSync(ecoPath)
      ? JSON.parse(fs.readFileSync(ecoPath, "utf8"))
      : {};

    const userData = initUser(data, userId);

    // APPLY PASSIVE INCOME UPDATES **every run**
    applyPassiveIncomeForUser(userData);

    // save after passive payouts
    save(ecoPath, data);

    // check plus
    const plusData = fs.existsSync(plusPath)
      ? JSON.parse(fs.readFileSync(plusPath, "utf8"))
      : {};
    const isPlus = !!plusData[userId];

    const upgradesData = loadUpgrades(); // all upgrade defs

    const nowForCooldowns = Date.now();
    if (subGroup === "lottery") {
      if (sub === "buy") {
        const count = interaction.options.getInteger("tickets") || 1;
        const result = buyTickets(userId, count);
        const e = await getUserEmbed(
          userId,
          await translateText(result.ok ? "Lottery Tickets" : "Lottery Failed", lang),
          result.ok ? undefined : "error",
        );

        if (result.ok) {
          const userCount = Array.isArray(result.entries) ? result.entries.length : 0;
          const totalTickets = Number(result.totalTickets || 0);
          e.setDescription([
            `${await translateText("Bought", lang)} **${result.bought}** ${await translateText("ticket(s)", lang)}.`,
            `${await translateText("Cost", lang)}: **${abbreviate(result.cost, "prefix")} ${currency}**`,
            `${await translateText("Prize pool", lang)}: **${abbreviate(result.prizePool, "prefix")} ${currency}**`,
            `${await translateText("Entries", lang)}: **${userCount}** ${await translateText("user(s)", lang)} / **${totalTickets}** ${await translateText("ticket(s)", lang)}`,
            `${await translateText("Time left", lang)}: **${msToPretty(result.timeLeft)}**`,
          ].join("\n"));
        } else {
          e.setDescription(await translateText(result.error || "Lottery purchase failed.", lang));
        }

        return interaction.editReply({ embeds: [e] });
      }

      const st = lotteryStatus();
      const e = await getUserEmbed(userId, await translateText("Global Lottery", lang));
      const userCount = Array.isArray(st.entries) ? st.entries.length : 0;
      e.setDescription([
        `${await translateText("Tickets sold", lang)}: **${st.totalTickets}**`,
        `${await translateText("Users entered", lang)}: **${userCount}**`,
        `${await translateText("Prize pool", lang)}: **${abbreviate(st.prizePool, "prefix")} ${currency}**`,
        `${await translateText("Ticket cost", lang)}: **${abbreviate(TICKET_COST, "prefix")} ${currency}**`,
        `${await translateText("Max tickets per user", lang)}: **${MAX_TICKETS}**`,
        `${await translateText("Time left", lang)}: **${msToPretty(st.timeLeft)}**`,
      ].join("\n"));
      return interaction.editReply({ embeds: [e] });
    }

    if (sub === "cooldowns") {
      const cooldowns = [
        ["Work", userData.lastWork, isPlus ? 30 * 60 * 1000 : 45 * 60 * 1000],
        ["Daily", userData.lastDaily, 24 * 60 * 60 * 1000],
        ["Beg", userData.lastBeg, isPlus ? 15 * 60 * 1000 : 30 * 60 * 1000],
        ["Bonus", userData.lastBonus, 6 * 60 * 60 * 1000],
        ["Monthly Plus", userData.lastMonthlyPlus, 30 * 24 * 60 * 60 * 1000],
      ];
      const lines = cooldowns.map(([name, last, cd]) => {
        const rem = cd - (nowForCooldowns - (last || 0));
        return rem <= 0 ? `Ready - **${name}**` : `Waiting - **${name}**: ${msToPretty(rem)}`;
      });
      const e = await getUserEmbed(userId, "Economy Cooldowns");
      e.setDescription(lines.join("\n"));
      return interaction.editReply({ embeds: [e] });
    }

    if (sub === "bonus") {
      const now = Date.now();
      const cd = 6 * 60 * 60 * 1000;
      const rem = cd - (now - userData.lastBonus);
      if (rem > 0) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(`You can claim another bonus in **${msToPretty(rem)}**.`);
        return interaction.editReply({ embeds: [e] });
      }
      const reward = Math.floor(Math.random() * 900) + (isPlus ? 800 : 250);
      userData.cash += reward;
      userData.lastBonus = now;
      save(ecoPath, data);
      const e = await getUserEmbed(userId, "Bonus Claimed");
      e.setDescription(`You found a bonus of **${abbreviate(reward, "prefix")} ${currency}**.`);
      return interaction.editReply({ embeds: [e] });
    }

    if (sub === "joinbonus") {
      if (userData.joinedBonus) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription("You already claimed your join bonus.");
        return interaction.editReply({ embeds: [e] });
      }
      const reward = isPlus ? 10000 : 5000;
      userData.cash += reward;
      userData.joinedBonus = true;
      save(ecoPath, data);
      const e = await getUserEmbed(userId, "Join Bonus Claimed");
      e.setDescription(`Welcome bonus claimed: **${abbreviate(reward, "prefix")} ${currency}**.`);
      return interaction.editReply({ embeds: [e] });
    }

    if (sub === "monthlyplus") {
      if (!isPlus) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription("This reward is only available to Plus users.");
        return interaction.editReply({ embeds: [e] });
      }
      const now = Date.now();
      const cd = 30 * 24 * 60 * 60 * 1000;
      const rem = cd - (now - userData.lastMonthlyPlus);
      if (rem > 0) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(`You can claim your monthly Plus reward again in **${msToPretty(rem)}**.`);
        return interaction.editReply({ embeds: [e] });
      }
      const reward = 1000000;
      userData.cash += reward;
      userData.lastMonthlyPlus = now;
      save(ecoPath, data);
      const e = await getUserEmbed(userId, "Monthly Plus Claimed");
      e.setDescription(`Plus reward claimed: **${abbreviate(reward, "prefix")} ${currency}**.`);
      return interaction.editReply({ embeds: [e] });
    }
    // ---------- BAL ----------
    if (sub === "bal") {
      const target = interaction.options.getUser("user") || interaction.user;
      if (target.bot) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText("Bots do not have balances.", lang),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const translation_1 = await translateText("Wallet", lang);
      const translation_2 = await translateText("Bank", lang);
      const translation_3 = await translateText("Total", lang);
      const translation_4 = await translateText("net worth", lang);

      const tData = initUser(data, target.id);
      const e = await getUserEmbed(userId, `Economy`);
      e.setTitle(`${target.username}'s ${translation_4}`);
      e.setDescription(
        `${translation_1}: **${abbreviate(tData.cash, "prefix")} ${currency}**\n` +
          `${translation_2}: **${abbreviate(tData.bank, "prefix")} ${currency}**\n` +
          `${translation_3}: **${abbreviate(tData.cash + tData.bank, "commas")} ${currency}**`,
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ---------- PASSIVE-INCOME ----------
    if (sub === "passive-income") {
      applyPassiveIncomeForUser(userData);
      save(ecoPath, data);

      if (
        !userData.passive ||
        !userData.passive.sources ||
        userData.passive.sources.length === 0
      ) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "You do not own any passive income upgrades.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const HOURLY = 60 * 60 * 1000;
      const now = Date.now();
      const last = userData.passive.lastPayout || now;
      const nextAt = last + HOURLY;

      let remaining = nextAt - now;
      if (remaining < 0) remaining = 0;

      const totalSec = Math.floor(remaining / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0 || days > 0) parts.push(`${hours}h`);
      if (mins > 0 || hours > 0 || days > 0) parts.push(`${mins}m`);
      parts.push(`${secs}s`);

      const pretty = parts.join(" ");

      // total hourly income from all miners
      const totalHourly = userData.passive.sources.reduce(
        (a, b) => a + (b.incomePerHour || 0),
        0,
      );

      const e = await getUserEmbed(userId, "Passive Income");
      const t1 = await translateText("Next income in", lang);
      const t2 = await translateText("Total hourly income", lang);
      e.setDescription(
        `${t1}: ${pretty}\n${t2}: **${abbreviate(totalHourly, "commas")} ${currency}**`,
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ---------- WORK ----------
    if (sub === "work") {
      const now = Date.now();
      const cd = isPlus ? 30 * 60 * 1000 : 45 * 60 * 1000;
      const rem = cd - (now - userData.lastWork);
      if (rem > 0) {
        const e = await getUserEmbed(userId, null, "error");
        const p1 = await translateText("You can work again in", lang);
        e.setDescription(`${p1} **${msToPretty(rem)}**.`);
        return interaction.editReply({ embeds: [e] });
      }

      // base random payout
      let baseEarned =
        Math.floor(Math.random() * (isPlus ? 151 : 101)) +
        (isPlus ? 150 : 100);

      // get best upgrade %
      const bonusPercent = getWorkBonusPercent(userData); // e.g. 50
      let bonusAmount = Math.round(baseEarned * (bonusPercent / 100));
      if (bonusAmount < 0) bonusAmount = 0; // safety
      const earnedTotal = baseEarned + bonusAmount;

      userData.cash += earnedTotal;
      userData.lastWork = now;
      save(ecoPath, data);

      const e = await getUserEmbed(userId, "Work Complete");
      const pp_1 = await translateText("You earned", lang);
      const pp_2 = await translateText("upgrade bonus", lang);
      e.setDescription(
        `${pp_1} **${abbreviate(earnedTotal, "prefix")} ${currency}**${bonusPercent > 0 ? ` (+${bonusPercent}% ${pp_2})` : ""}.`,
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ---------- DAILY ----------
    if (sub === "daily") {
      const now = Date.now();
      const cd = 24 * 60 * 60 * 1000;
      const rem = cd - (now - userData.lastDaily);
      if (rem > 0) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          (await translateText(
            `You already claimed your daily. Try again in `,
            lang,
          )) + `**${msToPretty(rem)}**.`,
        );
        return interaction.editReply({ embeds: [e] });
      }
      const reward = isPlus ? 1000 : 500;
      userData.cash += reward;
      userData.lastDaily = now;
      save(ecoPath, data);
      const e = await getUserEmbed(userId, "Daily Claimed");
      const __1 = await translateText("You claimed", lang);
      e.setDescription(
        `${__1} **${abbreviate(reward, "prefix")} ${currency}**.`,
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ---------- DEPOSIT ----------
    if (sub === "deposit") {
      const input = interaction.options.getString("amount");
      const isAll = input.toLowerCase() === "all";
      const amount = parseEcoAmountInput(input, userData.cash);

      if (!amount || amount <= 0 || amount > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          (await translateText("Invalid amount or insufficient", lang)) +
            " " +
            currency +
            ".",
        );
        return interaction.editReply({ embeds: [e] });
      }

      userData.cash -= amount;
      userData.bank += amount;
      save(ecoPath, data);

      const depositTitle = await translateText("Deposit Successful", lang);
      const depositedText = await translateText("Deposited", lang);
      const toBankText = await translateText("to your bank", lang);
      const newBalanceText = await translateText("New balance", lang);

      const walletDisplay = `${abbreviate(userData.cash, "prefix")} ${currency}`;
      const bankDisplay = `${abbreviate(userData.bank, "prefix")} ${currency}`;

      const e = await getUserEmbed(userId, depositTitle);
      e.setDescription(
        `${depositedText} **${isAll ? await translateText("all your", lang) : abbreviate(amount, "prefix")} ${currency}** ${toBankText}.\n` +
          `${newBalanceText}:\n> ?? ${walletDisplay}\n> ?? ${bankDisplay}`,
      );

      return interaction.editReply({ embeds: [e] });
    }

    // ---------- WITHDRAW ----------
    if (sub === "withdraw") {
      const input = interaction.options.getString("amount");
      const isAll = input.toLowerCase() === "all";
      const amount = parseEcoAmountInput(input, userData.bank);

      if (!amount || amount <= 0 || amount > userData.bank) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Invalid amount or insufficient bank balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      userData.bank -= amount;
      userData.cash += amount;
      save(ecoPath, data);

      const withdrawTitle = await translateText("Withdrawal Complete", lang);
      const withdrewText = await translateText("Withdrew", lang);
      const fromBankText = await translateText("from your bank", lang);
      const newBalanceText = await translateText("New balance", lang);

      const walletDisplay = `${abbreviate(userData.cash, "prefix")} ${currency}`;
      const bankDisplay = `${abbreviate(userData.bank, "prefix")} ${currency}`;

      const e = await getUserEmbed(userId, withdrawTitle);
      e.setDescription(
        `${withdrewText} **${isAll ? await translateText("all your", lang) : abbreviate(amount, "prefix")} ${currency}** ${fromBankText}.\n` +
          `${newBalanceText}:\n> ?? ${walletDisplay}\n> ?? ${bankDisplay}`,
      );

      return interaction.editReply({ embeds: [e] });
    }

    // ---------- PAY ----------
    if (sub === "transfer") {
      const target = interaction.options.getUser("user");
      const amount = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      if (
        !target ||
        target.bot ||
        target.id === userId ||
        amount <= 0 ||
        amount > userData.cash
      ) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText("Invalid target or amount.", lang),
        );
        return interaction.editReply({ embeds: [e] });
      }
      const tData = initUser(data, target.id);
      userData.cash -= amount;
      tData.cash += amount;
      save(ecoPath, data);
      const e = await getUserEmbed(userId, "Payment Sent");
      const _p = await translateText("You sent", lang);
      const _p1 = await translateText("to", lang);
      e.setDescription(
        `${_p} **${abbreviate(amount, "prefix")} ${currency}** ${_p1} **${target.username}**.`,
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ---------- LEADERBOARD ----------
    if (sub === "leaderboard") {
      const users = Object.entries(data)
        .map(([id, v]) => ({ id, total: (v.cash || 0) + (v.bank || 0) }))
        .filter((u) => u.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
      const lines = users.length
        ? users.map(
            (u, i) =>
              `${i + 1}. <@${u.id}> — **${abbreviate(u.total, "commas")} ${currency}**`,
          )
        : ["No users with " + currency + " yet."];
      const e = await getUserEmbed(userId, "Leaderboard");
      e.setDescription(lines.join("\n"));
      return interaction.editReply({ embeds: [e] });
    }

    // ---------- GAMBLE ----------
    if (sub === "gamble") {
      const amount = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      if (amount <= 0 || amount > userData.cash || amount < 10) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(await translateText("Invalid gamble amount.", lang));
        return interaction.editReply({ embeds: [e] });
      }

      const luckBonus = getGambleLuckBonusPercent(userData); // e.g. 10 means +10%
      const baseChance = 0.5;
      const didWin = Math.random() < baseChance + (luckBonus / 100) * 0.5;

      const gain = didWin ? amount : -amount;

      userData.cash += gain;
      save(ecoPath, data);

      // format numbers safely
      const gainDisplay = `${gain > 0 ? "+" : "-"}${abbreviate(Math.abs(gain), "prefix")} ${currency}`;
      const balanceDisplay = `${abbreviate(userData.cash, "prefix")} ${currency}`;

      // translate fixed text
      const youWonText = await translateText("You won", lang);
      const youLostText = await translateText("You lost", lang);
      const newBalanceText = await translateText("New balance", lang);

      const e = await getUserEmbed(userId, didWin ? "You Won!" : "You Lost");
      e.setDescription(
        `${didWin ? youWonText : youLostText} **x2** (${gainDisplay}).\n` +
          `${newBalanceText}: **${balanceDisplay}**.`,
      );

      return interaction.editReply({ embeds: [e] });
    }

    // ---------- ROULETTE ----------
    if (sub === "roulette") {
      const color = interaction.options.getString("color");
      const amount = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);

      if (amount <= 0 || amount > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          (await translateText("Invalid amount or insufficient", lang)) +
            " " +
            currency +
            ".",
        );
        return interaction.editReply({ embeds: [e] });
      }

      const luckBonus = getGambleLuckBonusPercent(userData) || 0;

      // ?? Define base probabilities
      const redChance = 0.475 + luckBonus / 5000; // 47.5% + small bonus
      const blackChance = 0.475 + luckBonus / 5000; // 47.5% + small bonus
      const greenChance = 1 - (redChance + blackChance); // remaining ~5%

      // Normalize if luck pushed total > 1
      const totalChance = redChance + blackChance + greenChance;
      const norm = 1 / totalChance;
      const finalRed = redChance * norm;
      const finalBlack = blackChance * norm;
      const finalGreen = greenChance * norm;

      // ?? Spin outcome
      const spin = Math.random();
      let outcome = "green";
      if (spin < finalRed) outcome = "red";
      else if (spin < finalRed + finalBlack) outcome = "black";

      // ?? Calculate payout
      let multiplier = 0;
      if (color === "green" && outcome === "green") multiplier = 14;
      else if (color === outcome) multiplier = 2;

      const win = multiplier > 0;
      const gain = win ? amount * multiplier - amount : -amount;
      userData.cash += gain;
      save(ecoPath, data);

      // ?? Display values
      const gainDisplay = `${gain > 0 ? "+" : "-"}${abbreviate(Math.abs(gain), "prefix")} ${currency}`;
      const balanceDisplay = `${abbreviate(userData.cash, "prefix")} ${currency}`;

      // ?? Translations
      const betText = await translateText("You bet on", lang);
      const outcomeText = await translateText("Outcome was", lang);
      const wonText = await translateText("You won", lang);
      const lostText = await translateText("You lost", lang);
      const newBalText = await translateText("New balance", lang);

      // ?? Embed setup
      const e = await getUserEmbed(
        userId,
        win ? "Roulette Win!" : "Roulette Lost",
      );
      e.setDescription(
        `${betText} **${color}** ??\n` +
          `${outcomeText} **${outcome}**.\n\n` +
          `${win ? `${wonText} **x${multiplier}** (${gainDisplay})` : `${lostText} (${gainDisplay})`}\n\n` +
          `${newBalText}: **${balanceDisplay}**`,
      );

      // ?? Optional: add a little spin animation
      const emojis = ["??", "?", "??"];
      const rollEmbed = await getUserEmbed(userId, "Spinning...");
      rollEmbed.setDescription(
        `${await translateText("The wheel is spinning...", lang)}\n${emojis[0]}`,
      );
      await interaction.editReply({ embeds: [rollEmbed] });

      // ?? Animation: realistic spin that slows down
      const sequence = [
        "??",
        "?",
        "??",
        "??",
        "?",
        "??",
        "?",
        "??",
        "??",
        "?",
        "??",
        "?",
      ];
      const spinSteps = 12; // how many total spins
      const baseDelay = 150; // starting speed

      for (let i = 0; i < spinSteps; i++) {
        const face = sequence[i % sequence.length];
        rollEmbed.setDescription(
          `${await translateText("The wheel is spinning...", lang)}\n${face}`,
        );
        await interaction.editReply({ embeds: [rollEmbed] });
        await new Promise((r) => setTimeout(r, baseDelay + i * 60)); // gradually slower
      }

      // ?? Suspense moment
      rollEmbed.setDescription(
        `${await translateText("Final color...", lang)} ??`,
      );
      await interaction.editReply({ embeds: [rollEmbed] });
      await new Promise((r) => setTimeout(r, 1500));

      // ?? Reveal actual outcome color
      let outcomeEmoji = "??";
      if (outcome === "red") outcomeEmoji = "??";
      else if (outcome === "black") outcomeEmoji = "?";

      rollEmbed.setDescription(
        `${await translateText("Result:", lang)} ${outcomeEmoji} **${await translateText(outcome.toUpperCase(), lang)}**`,
      );
      await interaction.editReply({ embeds: [rollEmbed] });

      // ? Wait before summary
      await new Promise((r) => setTimeout(r, 2000));

      // ?? Show final result embed
      await interaction.editReply({ embeds: [e] });
    }

    // ---------- SLOTS ----------
    if (sub === "slots") {
      try {
        const amount = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
        if (amount <= 0 || amount > userData.cash) {
          const e = await getUserEmbed(userId, null, "error");

          //(await translateText('Invalid amount or insufficient', lang) + ' ' +currency+'.');
          e.setDescription(
            (await translateText("Invalid amount or insufficient", lang)) +
              " " +
              currency +
              ".",
          );
          return interaction.editReply({ embeds: [e] });
        }

        const fruits = ["??", "??", "??", "??", "??", "7??"];
        const spin = () =>
          Array(3)
            .fill()
            .map(() => fruits[Math.floor(Math.random() * fruits.length)]);
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));

        // translated bits we’ll reuse
        const spinningText = await translateText("Spinning...", lang);
        const resultsText = await translateText("Results", lang);
        const youWonText = await translateText("You won", lang);
        const youLostText = await translateText("You lost", lang);
        const newBalanceText = await translateText("New balance", lang);

        // initial embed "Spinning..."
        const embed = await getUserEmbed(userId, "Slot Machine");
        embed.setDescription(spinningText);
        await interaction.editReply({ embeds: [embed] });

        // animation frames
        for (let i = 0; i < 6; i++) {
          const s = spin();
          embed.setDescription(
            `?? ${spinningText} \n| ${s[0]} | ${s[1]} | ${s[2]} |\n`,
          );
          await interaction.editReply({ embeds: [embed] });
          await delay(600);
        }

        // final roll
        const result = spin();
        const [a, b, c] = result;
        let multiplier = 0;
        if (a === "7??" && b === "7??" && c === "7??") multiplier = 10;
        else if (a === b && b === c) multiplier = 5;
        else if (a === b || b === c || a === c) multiplier = 2;

        const luckBonus = getGambleLuckBonusPercent(userData);
        const adjustedMultiplier =
          multiplier > 0 ? multiplier : Math.random() < luckBonus / 100 ? 2 : 0;
        const win = adjustedMultiplier > 0;
        const gain = win ? amount * (adjustedMultiplier - 1) : -amount;

        userData.cash += gain;
        save(ecoPath, data);

        // number formatting
        const gainDisplay = `${gain > 0 ? "+" : "-"}${abbreviate(Math.abs(gain), "prefix")} ${currency}`;
        const balanceDisplay = `${abbreviate(userData.cash, "prefix")} ${currency}`;

        embed.setDescription(
          `?? ${resultsText}\n| ${a} | ${b} | ${c} |\n\n` +
            (win
              ? `${youWonText} **x${multiplier}** (${gainDisplay})`
              : `${youLostText} (${gainDisplay})`) +
            `\n${newBalanceText}: **${balanceDisplay}**.`,
        );

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error("Slots error:", err);
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Something went wrong while spinning slots. Check console for details.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }
    }

    // ---------- BEG ----------
    if (sub === "beg") {
      const now = Date.now();
      const cd = isPlus ? 15 * 60 * 1000 : 30 * 60 * 1000;
      const rem = cd - (now - userData.lastBeg);
      if (rem > 0) {
        const e = await getUserEmbed(userId, null, "error");
        const tr1 = await translateText("You can beg again in", lang);
        e.setDescription(`${tr1} **${msToPretty(rem)}**.`);
        return interaction.editReply({ embeds: [e] });
      }
      const reward =
        Math.floor(Math.random() * (isPlus ? 101 : 81)) +
        (isPlus ? 80 : 50);
      userData.cash += reward;
      userData.lastBeg = now;
      save(ecoPath, data);
      const e = await getUserEmbed(userId, "You Begged");
      const tran11 = await translateText("Someone gave you", lang);
      e.setDescription(
        `${tran11} **${abbreviate(reward, "prefix")} ${currency}**.`,
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ---------- UPGRADES (GROUP) ----------
    if (subGroup === "upgrades") {
      // helper: get array of upgrade IDs in the order they're defined, for progression
      const upgradeOrder = Object.keys(upgradesData); // relies on order in upgrades.json

      // figure out which upgrade is "next" for this user
      const ownedSet = new Set(userData.upgrades || []);
      const nextUpgradeId =
        upgradeOrder.find((id) => !ownedSet.has(id)) || null;

      // /eco upgrades list
      if (sub === "list") {
        const e = await getUserEmbed(userId, "Your Upgrades");
        const x = await translateText("unknown", lang);

        const ownedLines = (userData.upgrades || []).length
          ? (userData.upgrades || []).map((id) => {
              const u = upgradesData[id];
              if (!u) return `• ${id} (${x})`;
              return `? **[${id}] ${u.name}**\n> ${u.description}`;
            })
          : [await translateText("You do not own any upgrades yet.", lang)];

        const p = await translateText("Next Available", lang);
        const d = await translateText("ID", lang);
        const c = await translateText("Cost", lang);

        const nextLine = nextUpgradeId
          ? (() => {
              const u = upgradesData[nextUpgradeId];
              return `\n**${p}:** ${u.name} (${d}: ${nextUpgradeId})\n> ${u.description}\n${c}: **${abbreviate(u.price, "commas")} ${currency}**`;
            })()
          : await translateText(
              "\nYou already own all available upgrades.",
              lang,
            );

        e.setDescription(`${ownedLines.join("\n")}\n${nextLine}`);
        return interaction.editReply({ embeds: [e] });
      }

      // /eco upgrades shop
      if (sub === "shop") {
        // We'll paginate through ALL upgrades, showing price and whether owned/locked.
        const entries = Object.entries(upgradesData); // [ [id, def], ... ]
        const perPage = 3;
        const totalPages = Math.ceil(entries.length / perPage);
        let currentPage = 1;

        const renderPage = async () => {
          const e = await getUserEmbed(
            userId,
            `Upgrade Shop (${currentPage}/${totalPages})`,
          );

          const start = (currentPage - 1) * perPage;
          const slice = entries.slice(start, start + perPage);

          let owned_ = await translateText("Owned", lang);
          let requires_ = await translateText("Requires", lang);

          let bonusTextWork = await translateText("work", lang);
          let bonusTextLuck = await translateText("luck", lang);
          let bonusTextUnknown = await translateText("Unknown", lang);
          let statusText = await translateText("Status", lang);
          let bonusText1 = await translateText("Bonus", lang);
          let bonusText2 = await translateText("income/hour", lang);

          const descBlocks = slice.map(([id, u]) => {
            const owned = ownedSet.has(id);
            const req = u.requires;
            const lockedBecauseMissingReq = req && !ownedSet.has(req);

            let status;
            if (owned) {
              status = "? " + owned_;
            } else if (lockedBecauseMissingReq) {
              const needName = upgradesData[req]?.name || req;
              status = `?? ${requires_} ${needName}`;
            } else {
              status = `?? ${abbreviate(u.price, "commas")} ${currency}`;
            }

            let type = u.type;
            let bonus;
            let bonusText;

            if (type === "miner") {
              bonus = u.incomePerHour || null;
              bonusText = bonusText2;
            } else {
              bonus = u.bonusWorkPercent
                ? u.bonusWorkPercent
                : u.bonusLuckPercent
                  ? u.bonusLuckPercent
                  : null;
              bonusText = u.bonusWorkPercent
                ? bonusTextWork
                : u.bonusLuckPercent
                  ? bonusTextLuck
                  : bonusTextUnknown;
            }

            return `**[${id}] ${u.name}**\n${u.description}\n${bonus ? `${bonusText1}: +${abbreviate(bonus, "commas")} ${currency} ${bonusText.charAt(0).toUpperCase() + bonusText.slice(1)}` : ""}\n${statusText}: ${status}`;
          });

          e.setDescription(descBlocks.join("\n\n"));

          // Buttons
          const prevBtn = new ButtonBuilder()
            .setCustomId("prev_upgrade_page")
            .setLabel(await translateText("Previous", lang))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1);

          const nextBtn = new ButtonBuilder()
            .setCustomId("next_upgrade_page")
            .setLabel(await translateText("Next", lang))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages);

          const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

          return {
            embeds: [e],
            components: totalPages > 1 ? [row] : [],
          };
        };

        const msg = await interaction.editReply(await renderPage());

        if (totalPages > 1) {
          const {
            ComponentType,
            ActionRowBuilder,
            ButtonBuilder,
            ButtonStyle,
          } = require("discord.js");
          const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000,
          });

          collector.on("collect", async (i) => {
            if (i.user.id !== userId) {
              return i.reply({
                content: await translateText(
                  "This is not your shop menu.",
                  lang,
                ),
                ephemeral: true,
              });
            }
            if (i.customId === "prev_upgrade_page" && currentPage > 1)
              currentPage--;
            if (i.customId === "next_upgrade_page" && currentPage < totalPages)
              currentPage++;
            await i.update(await renderPage());
          });

          collector.on("end", async () => {
            const disabled = (await renderPage()).components;
            if (disabled[0]) {
              disabled[0].components.forEach((btn) => btn.setDisabled(true));
              msg.edit({ components: disabled }).catch(() => {});
            }
          });
        }

        return;
      }

      // /eco upgrades buy
      if (sub === "buy") {
        const wantedId = interaction.options.getString("item");
        const upgradeDef = upgradesData[wantedId];

        // does this upgrade even exist?
        if (!upgradeDef) {
          const e = await getUserEmbed(userId, null, "error");
          e.setDescription(
            await translateText("That upgrade does not exist.", lang),
          );
          return interaction.editReply({ embeds: [e] });
        }

        // already own?
        if (ownedSet.has(wantedId)) {
          const e = await getUserEmbed(userId, null, "error");
          e.setDescription(
            await translateText("You already own this upgrade.", lang),
          );
          return interaction.editReply({ embeds: [e] });
        }

        // progression lock: can they actually buy this one next?
        // rule: must buy upgrades in order, and must meet .requires
        let allowedToBuy = true;

        // enforce order: cannot buy if there exists a previous upgrade in the list that you don't own yet
        // (upgradeOrder is in progression order)
        const firstMissingInOrder =
          upgradeOrder.find((id) => !ownedSet.has(id)) || null;
        if (firstMissingInOrder !== wantedId) {
          allowedToBuy = false;
        }

        // enforce requires field too
        if (upgradeDef.requires && !ownedSet.has(upgradeDef.requires)) {
          allowedToBuy = false;
        }

        if (!allowedToBuy) {
          const e = await getUserEmbed(userId, null, "error");
          e.setDescription(
            await translateText("You cannot buy this upgrade yet.", lang),
          );
          return interaction.editReply({ embeds: [e] });
        }

        // enough wallet?
        if (userData.cash < upgradeDef.price) {
          const e = await getUserEmbed(userId, null, "error");
          e.setDescription(
            (await translateText("Not enough", lang)) +
              " " +
              currency +
              " " +
              (await translateText("in wallet", lang)),
          );
          return interaction.editReply({ embeds: [e] });
        }

        // take money
        userData.cash -= upgradeDef.price;

        // grant upgrade
        userData.upgrades.push(wantedId);

        // if it's a miner-type upgrade, enable passive income tracking
        if (upgradeDef.type === "miner") {
          if (!userData.passive)
            userData.passive = { sources: [], lastPayout: Date.now() };

          // Add to sources if not already present
          const alreadyHas = userData.passive.sources.find(
            (s) => s.id === wantedId,
          );
          if (!alreadyHas) {
            userData.passive.sources.push({
              id: wantedId,
              incomePerHour: upgradeDef.incomePerHour || 0,
            });
          }

          // Reset payout timer if none exists
          if (
            !userData.passive.lastPayout ||
            userData.passive.lastPayout === 0
          ) {
            userData.passive.lastPayout = Date.now();
          }
        }

        save(ecoPath, data);

        const e = await getUserEmbed(userId, "Upgrade Purchased");
        const t_11 = await translateText("You bought", lang);
        const t_12 = await translateText("for", lang);
        e.setDescription(
          `${t_11} **${upgradeDef.name}** ${t_12} **${abbreviate(upgradeDef.price, "commas")} ${currency}**.`,
        );
        return interaction.editReply({ embeds: [e] });
      }
    }

    // ---------- STOCK (GROUP) ----------
    if (subGroup === "stock") {
      await updateStocksIfNeeded();

      const stocks = loadStocks();
      const bets = loadBets();
      const discord = stocks.discord;
      const userId = interaction.user.id;
      const userLang = getUserLanguage(userId) || "en";
      const eco = JSON.parse(fs.readFileSync(ecoPath, "utf8"));
      const userData = initUser(eco, userId);

      // ---- /eco stock view ----
      if (sub === "view") {
        const e = await getUserEmbed(userId, "Discord Inc. Stock");
        const dirIcon = discord.direction === "up" ? "??" : "??";
        const historyLines = discord.history
          .map((h) => `${h > 0 ? "+" : ""}${h}%`)
          .join("\n");
        const nextIn = msToPrettyShort(discord.nextUpdate - Date.now());

        const tt_1 = await translateText("Price:", userLang);
        const tt_2 = await translateText("Next update in:", userLang);
        const tt_3 = await translateText("Last changes:", userLang);
        const tt_4 = await translateText("Event:", userLang);

        e.setDescription(
          `${dirIcon} **Discord Inc.**\n` +
            `?? ${tt_1} **${abbreviate(discord.price, "prefix")} ${currency} (${discord.lastChange > 0 ? "+" : ""}${discord.lastChange}%)**\n` +
            `?? ${tt_2} ${nextIn}\n\n` +
            `${tt_3}\n${historyLines || "-"}` +
            (discord.event ? `\n\n?? ${tt_4} ${discord.event}` : ""),
        );
        return interaction.editReply({ embeds: [e] });
      }

      // ---- /eco stock bet ----
      if (sub === "bet") {
        const amount = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
        if (amount <= 0 || amount > userData.cash) {
          const e = await getUserEmbed(userId, null, "error");
          e.setDescription(
            (await translateText("Invalid or insufficient", userLang)) +
              " " +
              currency +
              ".",
          );
          return interaction.editReply({ embeds: [e] });
        }

        const activeBet = bets.active.find((b) => b.user === userId);
        if (activeBet) {
          const e = await getUserEmbed(userId, null, "error");
          const tr1 = await translateText(
            "You already have an active bet on",
            userLang,
          );
          const tr2 = await translateText(
            activeBet.direction === "up" ? "up ??" : "down ??",
            userLang,
          );
          e.setDescription(`${tr1} **${tr2}**.`);
          return interaction.editReply({ embeds: [e] });
        }

        const t_1 = await translateText("Current price:", userLang);
        const t_2 = await translateText(
          "Place your bet on whether the stock will go up or down in the next hour.",
          userLang,
        );

        const e = await getUserEmbed(userId, "Place Bet");
        e.setDescription(
          `${t_1} **${abbreviate(discord.price, "prefix")} ${currency}**\n${t_2}`,
        );

        const {
          ActionRowBuilder,
          ButtonBuilder,
          ButtonStyle,
          ComponentType,
        } = require("discord.js");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("bet_up")
            .setLabel("?? Up")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("bet_down")
            .setLabel("?? Down")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("bet_cancel")
            .setLabel(await translateText("Cancel", userLang))
            .setStyle(ButtonStyle.Secondary),
        );

        const msg = await interaction.editReply({
          embeds: [e],
          components: [row],
        });

        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000,
        });

        collector.on("collect", async (i) => {
          if (i.user.id !== userId) {
            return i.reply({
              content: await translateText("This is not your bet.", userLang),
              ephemeral: true,
            });
          }

          await i.deferUpdate();

          // Handle cancel button
          if (i.customId === "bet_cancel") {
            const c = await getUserEmbed(userId, "Cancelled");
            c.setDescription(await translateText("Bet cancelled.", userLang));
            return i.editReply({ embeds: [c], components: [] });
          }

          // Check again if user already has an active bet
          const currentBets = loadBets();
          const activeNow = currentBets.active.find((b) => b.user === userId);
          if (activeNow) {
            const already = await getUserEmbed(userId, null, "error");
            const tr1 = await translateText(
              "You already have an active bet on",
              userLang,
            );
            const tr2 = await translateText(
              activeNow.direction === "up" ? "up ??" : "down ??",
              userLang,
            );
            already.setDescription(`${tr1} **${tr2}**.`);
            return i.editReply({ embeds: [already], components: [] });
          }

          // Determine direction
          const dir = i.customId === "bet_up" ? "up" : "down";
          userData.cash -= amount;
          save(ecoPath, eco);
          bets.active.push({
            user: userId,
            amount,
            direction: dir,
            priceAtBet: discord.price,
            timestamp: Date.now(),
          });
          save(betsPath, bets);

          const tr_1 = await translateText(
            "You bet that Discord Inc. will go",
            userLang,
          );
          const tr_2 = await translateText(
            dir === "up" ? "up ??" : "down ??",
            userLang,
          );

          const confirm = await getUserEmbed(userId, "Bet Placed");
          confirm.setDescription(
            `${tr_1} **${tr_2}** (${abbreviate(amount, "prefix")} ${currency}).`,
          );

          await i.editReply({ embeds: [confirm], components: [] });
        });

        collector.on("end", async () => {
          try {
            const disabled = new ActionRowBuilder().addComponents(
              row.components.map((b) => b.setDisabled(true)),
            );
            await msg.edit({ components: [disabled] }).catch(() => {});
          } catch {}
        });
      }

      // ---- /eco stock analyze ----
      if (sub === "analyze") {
        const isPlus = JSON.parse(fs.readFileSync(plusPath, "utf8"))[
          userId
        ];
        const cost = isPlus ? 450 : 650;
        const accuracy = isPlus ? 85 : 65;
        const risk = 100 - accuracy;

        const transl1 = await translateText(
          "You will receive an expert hint about Discord Inc.'s next movement.",
          userLang,
        );
        const transl2 = await translateText("Accuracy", userLang);
        const transl3 = await translateText("risk", userLang);
        const transl4 = await translateText("Cost", userLang);

        const e = await getUserEmbed(userId, "Expert Analysis");
        e.setDescription(
          transl1 +
            "\n" +
            transl2 +
            ": **" +
            accuracy +
            "%** (" +
            transl3 +
            " " +
            risk +
            "%)\n" +
            transl4 +
            ": **" +
            abbreviate(cost, "prefix") +
            " " +
            currency +
            "**",
        );

        const {
          ActionRowBuilder,
          ButtonBuilder,
          ButtonStyle,
          ComponentType,
        } = require("discord.js");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("buy_analysis")
            .setLabel(await translateText("Purchase", userLang))
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("cancel_analysis")
            .setLabel(await translateText("Cancel", userLang))
            .setStyle(ButtonStyle.Secondary),
        );

        const msg = await interaction.editReply({
          embeds: [e],
          components: [row],
        });

        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000,
        });
        collector.on("collect", async (i) => {
          if (i.user.id !== userId)
            return i.reply({
              content: await translateText("This is not your menu.", userLang),
              ephemeral: true,
            });

          await i.deferUpdate(); // prevent Unknown interaction

          if (i.customId === "cancel_analysis") {
            const c = await getUserEmbed(userId, "Cancelled");
            c.setDescription(
              await translateText("Purchase cancelled.", userLang),
            );
            return interaction.editReply({ embeds: [c], components: [] });
          }

          if (userData.cash < cost) {
            const e2 = await getUserEmbed(userId, null, "error");
            e2.setDescription(
              (await translateText("Not enough", userLang)) +
                " " +
                currency +
                ".",
            );
            return interaction.editReply({ embeds: [e2], components: [] });
          }

          // deduct cost
          userData.cash -= cost;
          save(ecoPath, eco);

          // --- Realistic prediction based on stock history ---
          const history = stocks.discord.history || [];
          const trend = stocks.discord.lastChange;

          // Calculate short-term average and volatility
          const avgChange = history.length
            ? history.reduce((a, b) => a + b, 0) / history.length
            : trend;

          const volatility = history.length
            ? Math.sqrt(
                history
                  .map((h) => (h - avgChange) ** 2)
                  .reduce((a, b) => a + b, 0) / history.length,
              )
            : 0;

          // Determine base direction
          const baseDir = avgChange >= 0 ? "up" : "down";

          // Higher volatility = higher risk of error
          const volatilityFactor = Math.min(1, volatility / 15); // capped to avoid extreme noise
          const wrongChance = (risk / 100) * (0.5 + volatilityFactor);

          // Occasionally flip the prediction depending on volatility + user risk
          const actualDir =
            Math.random() < wrongChance
              ? baseDir === "up"
                ? "down"
                : "up"
              : baseDir;

          // Predict next % change with realism
          let predictedChange =
            Math.abs(avgChange) * (1 + Math.random() * 0.3) +
            volatility * (Math.random() - 0.5);

          // Clamp predicted change to reasonable range
          let predictedChangeClamped = Math.max(
            1,
            Math.min(predictedChange, 20),
          );

          const accuracy = 100 - risk;
          const dirIcon = actualDir === "up" ? "??" : "??";

          const t1 = await translateText(
            "Experts analyzed the latest data for **Discord Inc.** and predict it will",
            userLang,
          );
          const t2 = await translateText("by around", userLang);
          const t3 = await translateText("in the next hour.", userLang);
          const t4 = await translateText("Accuracy", userLang);
          const t5 = await translateText("Confidence", userLang);

          // build DM embed
          const dmEmbed = await getUserEmbed(userId, "Expert Stock Analysis");
          dmEmbed.setDescription(
            `${t1} **${actualDir === "up" ? `${await translateText("rise", userLang)}` : `${await translateText("fall", userLang)}`} ${dirIcon}** ${t2} **${predictedChangeClamped.toFixed(1)}%** ${t3}\n\n**${t4}:** ${accuracy}%\n**${t5}:** ${actualDir === baseDir ? `${await translateText("High", userLang)}` : `${await translateText("Uncertain (risk triggered)", userLang)}`}`,
          );

          let dmSuccess = false;

          try {
            await interaction.user.send({ embeds: [dmEmbed] });
            dmSuccess = true;
          } catch {
            dmSuccess = false;
          }

          if (!dmSuccess) {
            userData.cash += cost;
            save(ecoPath, eco);
            const fail = await getUserEmbed(userId, null, "error");
            fail.setDescription(
              await translateText(
                `DMs are closed. Purchase refunded.`,
                userLang,
              ),
            );
            return interaction.editReply({ embeds: [fail], components: [] });
          }

          // Now safely handle success UI (no risk of refund misfires)
          const dmButton = new ButtonBuilder()
            .setLabel(await translateText("Go to DMs", userLang))
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/@me`);

          const row = new ActionRowBuilder().addComponents(dmButton);
          const success = await getUserEmbed(userId, "Analysis Sent");
          success.setDescription(
            await translateText(
              `Your expert analysis has been sent to your DMs.`,
              userLang,
            ),
          );

          const msg2 = await interaction.editReply({
            embeds: [success],
            components: [row],
          });

          setTimeout(() => {
            try {
              msg2
                .edit({
                  components: [
                    new ActionRowBuilder().addComponents(
                      dmButton.setDisabled(true),
                    ),
                  ],
                })
                .catch(() => {});
            } catch {}
          }, 30_000);
        });
      }
    }

    // ---------- PROFILE ----------
    if (sub === "profile") {
      const target = interaction.options.getUser("user") || interaction.user;
      const data = JSON.parse(fs.readFileSync(ecoPath, "utf8"));
      const userData = initUser(data, target.id);
      const lang = getUserLanguage(target.id) || "en";

      const wallet = abbreviate(userData.cash, "prefix");
      const bank = abbreviate(userData.bank, "prefix");
      const total = abbreviate(userData.cash + userData.bank, "prefix");
      const stats = userData.stockStats || {
        totalBets: 0,
        wins: 0,
        losses: 0,
        bets: [],
      };
      const winRate = stats.totalBets
        ? ((stats.wins / stats.totalBets) * 100).toFixed(1)
        : "0.0";
      const lastBets =
        stats.bets
          .slice(0, 5)
          .map((b, i) => {
            const gain = abbreviate(Math.abs(b.gain), "prefix");
            return `${i + 1}. ${b.result === "win" ? "?" : "?"} ${b.result === "win" ? "+" : "-"}${gain} ${currency} (${b.direction === "up" ? "??" : "??"})`;
          })
          .join("\n") || (await translateText("No bets yet.", lang));

      const upgrades = (userData.upgrades || []).length
        ? userData.upgrades.join(", ")
        : await translateText("None", lang);

      const ppp = await translateText("Profile", lang);
      const ppp1 = await translateText("Wallet:", lang);
      const ppp2 = await translateText("Bank:", lang);
      const ppp3 = await translateText("Total:", lang);
      const ppp4 = await translateText("Stock Stats:", lang);
      const ppp5 = await translateText("Total Bets:", lang);
      const ppp6 = await translateText("Wins:", lang);
      const ppp7 = await translateText("Losses:", lang);
      const ppp8 = await translateText("Win Rate:", lang);
      const ppp9 = await translateText("Recent Bets:", lang);
      const ppp10 = await translateText("Upgrades Owned:", lang);

      const e = await getUserEmbed(target.id, `Profile`);
      e.setTitle(target.username + "'s " + ppp);
      e.setDescription(
        `?? ${ppp1} **${wallet} ${currency}**\n?? ${ppp2} **${bank} ${currency}**\n?? ${ppp3} **${total} ${currency}**\n\n?? ${ppp4}\n${ppp5} ${stats.totalBets}\n${ppp6} ${stats.wins}\n${ppp7} ${stats.losses}\n${ppp8} ${winRate}%\n\n${ppp9}\n${lastBets}\n\n?? ${ppp10}\n${upgrades}`,
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ---------- MINES ----------
    if (sub === "mines") {
      const amount = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      const mineCount = interaction.options.getInteger("mines");
      if (mineCount < 1 || mineCount > 5) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText("Number of mines must be between 1 and 5.", lang),
        );
        return interaction.editReply({ embeds: [e] });
      }

      if (amount < 100 || amount > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Minimum bet is 100 Cash and you must have enough balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const luckBonus = getGambleLuckBonusPercent(userData);
      const gridSize = 4; // 4x4 grid
      const totalCells = gridSize * gridSize;
      const adjustedMineCount = Math.max(
        1,
        Math.round(mineCount - mineCount * (luckBonus / 100) * 0.3),
      );

      const mineIndexes = new Set();
      while (mineIndexes.size < adjustedMineCount)
        mineIndexes.add(Math.floor(Math.random() * totalCells));

      userData.cash -= amount;
      save(ecoPath, data);

      const safeCells = [];
      let multiplier = 1.0;
      let ended = false;

      const createBoard = async (reveal = false) => {
        const gridSize = 4; // 4x4 grid now
        const totalCells = gridSize * gridSize;
        const rows = [];
        let i = 0;

        for (let y = 0; y < gridSize; y++) {
          const row = new ActionRowBuilder();
          for (let x = 0; x < gridSize; x++) {
            const cell = i++;
            const isMine = mineIndexes.has(cell);
            const revealed = safeCells.includes(cell);
            const btn = new ButtonBuilder()
              .setCustomId(`mine_${cell}`)
              .setStyle(
                reveal
                  ? isMine
                    ? ButtonStyle.Danger
                    : ButtonStyle.Success
                  : revealed
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary,
              )
              .setLabel(
                reveal ? (isMine ? "??" : "??") : revealed ? "??" : "?",
              )
              .setDisabled(reveal || revealed || ended);
            row.addComponents(btn);
          }
          rows.push(row);
        }

        // now add cashout row as the 5th
        const cashBtn = new ButtonBuilder()
          .setCustomId("cashout_mines")
          .setLabel(await translateText("Cash Out", lang))
          .setStyle(ButtonStyle.Success)
          .setDisabled(ended || reveal);
        const cashRow = new ActionRowBuilder().addComponents(cashBtn);
        rows.push(cashRow);

        const e = await getUserEmbed(userId, "Mines Game");
        const potential = abbreviate(Math.round(amount * multiplier), "prefix");
        e.setDescription(
          `${await translateText("Find gems, avoid mines!", lang)}\n?? ${await translateText("Mines:", lang)} ${adjustedMineCount}\n?? ${await translateText("Potential cashout:", lang)} **${potential} ${currency}**\n?? ${await translateText("Multiplier:", lang)} x${multiplier.toFixed(2)}`,
        );

        return { embeds: [e], components: rows };
      };

      const msg = await interaction.editReply(await createBoard());
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 600000, // 10 min timeout
      });

      collector.on("collect", async (i) => {
        if (i.user.id !== userId)
          return i.reply({
            content: await translateText("This is not your game.", lang),
            ephemeral: true,
          });
        if (ended) return;

        // Cashout pressed
        if (i.customId === "cashout_mines") {
          ended = true;
          collector.stop();
          const winAmount = Math.round(amount * multiplier);
          userData.cash += winAmount;
          save(ecoPath, data);

          const cash = await getUserEmbed(userId, "Cashed Out!");
          cash.setDescription(
            `?? ${await translateText("You cashed out successfully!", lang)}\n${await translateText("You won", lang)} **${abbreviate(winAmount, "prefix")} ${currency}**.`,
          );
          return i.update(await createBoard(true));
        }

        const cellIndex = parseInt(i.customId.split("_")[1]);
        if (isNaN(cellIndex)) return;

        // Mine hit
        if (mineIndexes.has(cellIndex)) {
          ended = true;
          collector.stop();
          const lose = await getUserEmbed(userId, "Boom!");
          lose.setDescription(
            `?? ${await translateText("You hit a mine and lost", lang)} **${abbreviate(amount, "prefix")} ${currency}**.`,
          );
          return i.update(await createBoard(true));
        }

        // Safe click
        safeCells.push(cellIndex);
        multiplier += adjustedMineCount * 0.25 + (luckBonus / 100) * 0.15;
        await i.update(await createBoard());
      });

      collector.on("end", async () => {
        if (!ended) {
          ended = true;
          const winAmount = Math.round(amount * multiplier);
          userData.cash += winAmount;
          save(ecoPath, data);

          const timeout = await getUserEmbed(userId, "Time Up");
          timeout.setDescription(
            `? ${await translateText("You ran out of time. Auto-cashed out.", lang)}\n${await translateText("You won", lang)} **${abbreviate(winAmount, "prefix")} ${currency}**.`,
          );
          await msg.edit(await createBoard(true)).catch(() => {});
        }
      });
    }

    // ---------- CRASH ----------
    if (sub === "crash") {
      const amount = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      if (amount < 100 || amount > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Minimum bet is 100 Cash and you must have enough balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const luckBonus = getGambleLuckBonusPercent(userData);

      // base target where it will explode
      const baseCrash = Math.random() * 5 + 1; // 1x–6x
      const adjustedCrash = baseCrash * (1 + (luckBonus / 100) * 0.2);
      const crashPoint = Number(adjustedCrash.toFixed(2));

      // take bet up front
      userData.cash -= amount;
      save(ecoPath, data);

      // state
      let multiplier = 1.0;
      let crashed = false;
      let cashedMultiplier = null; // number if cashed, else null
      let wonAmount = 0;

      // build first embed + button
      const liveEmbed = await getUserEmbed(userId, "Crash Game");
      liveEmbed.setDescription(
        `?? ${await translateText("Starting...", lang)}\n` +
          `**x${multiplier.toFixed(2)}**`,
      );

      const cashBtn = new ButtonBuilder()
        .setCustomId("crash_cashout")
        .setLabel(await translateText("Cash Out", lang))
        .setStyle(ButtonStyle.Success);

      const rowActive = new ActionRowBuilder().addComponents(cashBtn);

      // send msg
      const msg = await interaction.editReply({
        embeds: [liveEmbed],
        components: [rowActive],
      });

      // collector for cashout button
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
      });

      collector.on("collect", async (i) => {
        if (i.user.id !== userId) {
          return i.reply({
            content: await translateText("This is not your game.", lang),
            ephemeral: true,
          });
        }
        // if already cashed or already crashed just ignore
        if (cashedMultiplier !== null || crashed) return;

        cashedMultiplier = multiplier; // lock in the cashout multiplier now
        wonAmount = Math.round(amount * cashedMultiplier);

        // pay instantly
        userData.cash += wonAmount;
        save(ecoPath, data);

        // after cashout, disable button permanently
        const rowDisabled = new ActionRowBuilder().addComponents(
          ButtonBuilder.from(cashBtn).setDisabled(true),
        );

        // update embed to include the "? cashed out..." line under current status
        const currentVal = Math.round(amount * multiplier);
        liveEmbed.setDescription(
          `?? ${await translateText("Flying...", lang)}\n` +
            `**x${multiplier.toFixed(2)}**\n` +
            `?? ${await translateText("Current value", lang)}: **${abbreviate(currentVal, "prefix")} ${currency}**\n\n` +
            `? ${await translateText("Cashed out at", lang)} **x${cashedMultiplier.toFixed(2)}** ` +
            `(+${abbreviate(wonAmount, "prefix")} ${currency})`,
        );

        await i.update({
          embeds: [liveEmbed],
          components: [rowDisabled],
        });
      });

      // game tick loop
      const tickLoop = async () => {
        if (crashed) return;

        // increase multiplier, speed up over time
        multiplier += Math.random() * 0.25 + 0.1;

        // did we explode yet?
        if (multiplier >= crashPoint) {
          crashed = true;
          collector.stop(); // stop button collector so no more clicks

          // when crash happens, show final "boom" state, button disabled
          const rowDisabled = new ActionRowBuilder().addComponents(
            ButtonBuilder.from(cashBtn).setDisabled(true),
          );

          liveEmbed.setDescription(
            `?? ${await translateText("It exploded at", lang)} **x${crashPoint.toFixed(2)}**!\n` +
              (cashedMultiplier === null
                ? `${await translateText("You lost", lang)} **${abbreviate(amount, "prefix")} ${currency}**.`
                : `? ${await translateText("You cashed out at", lang)} **x${cashedMultiplier.toFixed(2)}**\n` +
                  `${await translateText("You won", lang)} **${abbreviate(wonAmount, "prefix")} ${currency}**.`),
          );

          await interaction
            .editReply({
              embeds: [liveEmbed],
              components: [rowDisabled],
            })
            .catch(() => {});

          // summary after short delay
          setTimeout(async () => {
            const summary = await getUserEmbed(userId, "Crash Summary");

            if (cashedMultiplier === null) {
              // never cashed
              summary.setDescription(
                `?? **${await translateText("Summary", lang)}**\n` +
                  `${await translateText("Max multiplier reached", lang)}: **x${crashPoint.toFixed(2)}**\n` +
                  `${await translateText("Cashed out", lang)}: ?\n` +
                  `${await translateText("Lost", lang)}: **${abbreviate(amount, "prefix")} ${currency}**`,
              );
            } else {
              summary.setDescription(
                `?? **${await translateText("Summary", lang)}**\n` +
                  `${await translateText("Max multiplier reached", lang)}: **x${crashPoint.toFixed(2)}**\n` +
                  `${await translateText("Cashed out at", lang)}: **x${cashedMultiplier.toFixed(2)}**\n` +
                  `${await translateText("Won", lang)}: **${abbreviate(wonAmount, "prefix")} ${currency}**`,
              );
            }

            await interaction
              .editReply({
                embeds: [summary],
                components: [],
              })
              .catch(() => {});
          }, 2500);

          return;
        }

        // still flying, update live embed
        const currentVal = Math.round(amount * multiplier);

        // show cashout line if already cashed
        const cashedLine =
          cashedMultiplier !== null
            ? `\n\n? ${await translateText("Cashed out at", lang)} **x${cashedMultiplier.toFixed(2)}** ` +
              `(+${abbreviate(wonAmount, "prefix")} ${currency})`
            : "";

        liveEmbed.setDescription(
          `?? ${await translateText("Flying...", lang)}\n` +
            `**x${multiplier.toFixed(2)}**\n` +
            `?? ${await translateText("Current value", lang)}: **${abbreviate(currentVal, "prefix")} ${currency}**` +
            cashedLine,
        );

        // if user already cashed, button should be disabled in UI now
        const rowNow = new ActionRowBuilder().addComponents(
          ButtonBuilder.from(cashBtn).setDisabled(cashedMultiplier !== null),
        );

        await interaction
          .editReply({
            embeds: [liveEmbed],
            components: [rowNow],
          })
          .catch(() => {});

        // schedule next tick faster and faster
        const delayMs = Math.max(100, 700 - multiplier * 50);
        setTimeout(tickLoop, delayMs);
      };

      // start loop
      setTimeout(tickLoop, 1000);
    }

    // ---------- SCRATCH ----------
    if (sub === "scratch") {
      const amount = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      if (amount < 100 || amount > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Minimum bet is 100 Cash and you must have enough balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const symbols = ["7", "$", "N", "C", "X"];
      const weights = [8, 16, 24, 26, 26];
      const payoutByCount = { 3: 0.4, 4: 1.3, 5: 2.5, 6: 5, 7: 10, 8: 20, 9: 50 };
      const revealed = Array(9).fill(false);
      const card = [];
      let finished = false;

      function pickSymbol() {
        const total = weights.reduce((sum, n) => sum + n, 0);
        let roll = Math.random() * total;
        for (let i = 0; i < symbols.length; i++) {
          roll -= weights[i];
          if (roll <= 0) return symbols[i];
        }
        return symbols[symbols.length - 1];
      }

      for (let i = 0; i < 9; i++) card.push(pickSymbol());

      userData.cash -= amount;
      save(ecoPath, data);

      function getBestMatch() {
        const counts = {};
        for (const symbol of card) counts[symbol] = (counts[symbol] || 0) + 1;
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      }

      function makeScratchRows(disabled = false) {
        const rows = [];
        for (let row = 0; row < 3; row++) {
          const actionRow = new ActionRowBuilder();
          for (let col = 0; col < 3; col++) {
            const index = row * 3 + col;
            actionRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`scratch_${index}`)
                .setLabel(revealed[index] ? card[index] : "Scratch")
                .setStyle(revealed[index] ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(disabled || revealed[index]),
            );
          }
          rows.push(actionRow);
        }
        return rows;
      }

      async function buildScratchEmbed(status, payout = null) {
        const embed = await getUserEmbed(userId, payout ? "Scratch Result" : "Scratch Card");
        const shown = card
          .map((symbol, index) => (revealed[index] ? `**${symbol}**` : "`?`"))
          .reduce((rows, value, index) => {
            if (index % 3 === 0) rows.push([]);
            rows[rows.length - 1].push(value);
            return rows;
          }, [])
          .map((row) => row.join("  "))
          .join("\n");

        const lines = [
          `Bet: **${abbreviate(amount, "prefix")} ${currency}**`,
          `Balance: **${abbreviate(userData.cash, "prefix")} ${currency}**`,
          "",
          shown,
          "",
          status,
          "",
          "Payouts: 3 match = 0.4x, 4 = 1.3x, 5 = 2.5x, 6+ = jackpot tiers.",
        ];

        if (payout) {
          const change = payout.totalWon - amount;
          lines.push(
            "",
            `Best match: **${payout.symbol} x${payout.count}**`,
            `Multiplier: **${payout.multiplier}x**`,
            `Payout: **${abbreviate(payout.totalWon, "prefix")} ${currency}**`,
            `Result: **${change >= 0 ? "+" : "-"}${abbreviate(Math.abs(change), "prefix")} ${currency}**`,
          );
        }

        embed.setDescription(lines.join("\n"));
        return embed;
      }

      async function finishScratch(reason) {
        if (finished) return;
        finished = true;
        for (let i = 0; i < revealed.length; i++) revealed[i] = true;

        const [symbol, count] = getBestMatch();
        const multiplier = payoutByCount[Math.min(count, 9)] || 0;
        const totalWon = Math.round(amount * multiplier);
        userData.cash += totalWon;
        save(ecoPath, data);

        const embed = await buildScratchEmbed(reason, {
          symbol,
          count,
          multiplier,
          totalWon,
        });
        await interaction.editReply({ embeds: [embed], components: makeScratchRows(true) }).catch(() => {});
      }

      const startEmbed = await buildScratchEmbed("Reveal every tile to scratch the card.");
      const msg = await interaction.editReply({ embeds: [startEmbed], components: makeScratchRows() });
      const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 90_000 });

      collector.on("collect", async (i) => {
        if (i.user.id !== userId) {
          return i.reply({ content: await translateText("This is not your game.", lang), ephemeral: true });
        }

        const index = Number(i.customId.split("_")[1]);
        if (!Number.isInteger(index) || index < 0 || index >= revealed.length || revealed[index]) {
          return i.deferUpdate().catch(() => {});
        }

        revealed[index] = true;
        await i.deferUpdate().catch(() => {});

        if (revealed.every(Boolean)) {
          collector.stop("finished");
          await finishScratch("Card fully scratched.");
          return;
        }

        const embed = await buildScratchEmbed(`${revealed.filter(Boolean).length}/9 tiles revealed.`);
        await interaction.editReply({ embeds: [embed], components: makeScratchRows() }).catch(() => {});
      });

      collector.on("end", async (_, reason) => {
        if (!finished && reason !== "finished") {
          await finishScratch("Time expired. Card auto-revealed.");
        }
      });

      return;
    }

    // ---------- HORSE ----------
    if (sub === "horse") {
      const amount = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      const pickedHorse = interaction.options.getInteger("horse");

      if (amount < 100 || amount > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Minimum bet is 100 Cash and you must have enough balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const horses = [
        { name: "Blaze", color: "??", runner: "??" },
        { name: "Comet", color: "??", runner: "??" },
        { name: "Nova", color: "??", runner: "??" },
        { name: "Viper", color: "??", runner: "??" },
        { name: "Echo", color: "??", runner: "??" },
      ];
      const finishLine = 10;
      const positions = Array(horses.length).fill(0);
      const luckBonus = getGambleLuckBonusPercent(userData) || 0;

      userData.cash -= amount;
      save(ecoPath, data);

      function renderRace(winner = null) {
        return horses
          .map((horse, index) => {
            const picked = index === pickedHorse ? " • your pick" : "";
            const marker = winner === index ? " • winner" : "";
            const filled = Math.min(positions[index], finishLine);
            const empty = Math.max(0, finishLine - filled);
            const track = `${"?".repeat(filled)}${horse.runner}${"?".repeat(empty)}`;
            return `${horse.color} **${horse.name}${picked}${marker}**\n${track}  **${filled}/${finishLine}**`;
          })
          .join("\n\n");
      }

      async function buildRaceEmbed(title, status, winner = null, payout = null) {
        const embed = await getUserEmbed(userId, title);
        const lines = [
          `Bet: **${abbreviate(amount, "prefix")} ${currency}**`,
          `Pick: ${horses[pickedHorse].color} **${horses[pickedHorse].name}**`,
          `Balance: **${abbreviate(userData.cash, "prefix")} ${currency}**`,
          `Luck bonus: **${luckBonus}%**`,
          "",
          renderRace(winner),
          "",
          status,
        ];

        if (payout) {
          const change = payout.totalWon - amount;
          lines.push(
            "",
            `Winner: ${horses[payout.winner].color} **${horses[payout.winner].name}**`,
            `Payout: **${abbreviate(payout.totalWon, "prefix")} ${currency}**`,
            `Result: **${change >= 0 ? "+" : "-"}${abbreviate(Math.abs(change), "prefix")} ${currency}**`,
          );
        }

        embed.setDescription(lines.join("\n"));
        return embed;
      }

      let raceWinner = null;
      let tick = 0;

      while (raceWinner === null && tick < 24) {
        tick++;
        for (let i = 0; i < horses.length; i++) {
          const luck = i === pickedHorse ? luckBonus / 180 : 0;
          const roll = Math.random() + luck;
          const move = roll > 0.82 ? 2 : roll > 0.28 ? 1 : 0;
          positions[i] = Math.min(finishLine, positions[i] + move);
        }

        const leaders = positions
          .map((position, index) => ({ position, index }))
          .filter((horse) => horse.position >= finishLine);

        if (leaders.length) {
          raceWinner = leaders[Math.floor(Math.random() * leaders.length)].index;
        }

        const embed = await buildRaceEmbed("Horse Race", raceWinner === null ? "Race in progress..." : "Photo finish...", raceWinner);
        await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
        if (raceWinner === null) await new Promise((resolve) => setTimeout(resolve, 900));
      }

      if (raceWinner === null) {
        const best = Math.max(...positions);
        const leaders = positions
          .map((position, index) => ({ position, index }))
          .filter((horse) => horse.position === best);
        raceWinner = leaders[Math.floor(Math.random() * leaders.length)].index;
      }

      const totalWon = raceWinner === pickedHorse ? Math.round(amount * 4) : 0;
      userData.cash += totalWon;
      save(ecoPath, data);

      const resultEmbed = await buildRaceEmbed(
        raceWinner === pickedHorse ? "Horse Race Win" : "Horse Race Loss",
        raceWinner === pickedHorse ? "Your horse won the race." : "Your horse did not win this time.",
        raceWinner,
        { winner: raceWinner, totalWon },
      );
      return interaction.editReply({ embeds: [resultEmbed], components: [] });
    }
    // ---------- PLINKO ----------
    if (sub === "plinko") {
      const betArg = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      let slots = interaction.options.getInteger("slots") || 6;
      if (slots < 6 || slots > 9) slots = 6;

      if (betArg < 100 || betArg > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Minimum bet is 100 Cash and you must have enough balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      // session state
      let currentBet = betArg;
      let netGain = 0;
      let dropping = false;
      let stopped = false;
      let lastPath = []; // array of column indexes for last finished ball fall
      let lastBetUsed = 0; // bet that was actually spent on last drop
      let lastFinalMult = null; // last payout multiplier
      let lastGain = 0; // last gain/loss from that drop
      const luckBonus = getGambleLuckBonusPercent(userData) || 0;

      // --- multiplier map generator (symmetric edges high, middle trash) ---
      function generateMultipliers(numSlots) {
        const center = (numSlots - 1) / 2;

        // adjust based on slot count
        // fewer slots = smaller spread; more slots = higher risk/reward
        const minCenter = numSlots === 6 ? 0.45 : 0.2 + (9 - numSlots) * 0.083;
        const peakEdge = numSlots === 6 ? 3 : 3 + (numSlots - 6) * 3.67;

        const arr = [];
        for (let i = 0; i < numSlots; i++) {
          const dist = Math.abs(i - center); // 0=center ? max edges
          const edgeFactor = dist / center; // 0–1
          const mult =
            minCenter + (peakEdge - minCenter) * Math.pow(edgeFactor, 2.8); // steeper curve
          arr.push(Number(mult.toFixed(2)));
        }
        return arr;
      }

      const slotMults = generateMultipliers(slots);

      // --- render board as multi-row preview ---
      // fallHistory: array of column indexes at each row step while currently dropping
      // landedPath:  array of column indexes of the LAST completed ball (used when idle, to "freeze" ball)
      function renderBoard(fallHistory, landedPath) {
        const rowsTxt = [];
        const rowsToRender = Math.max(
          fallHistory?.length || 0,
          landedPath?.length || 0,
          1,
        );

        // spacing between each slot
        const SPACING = "? ? ? ? ? ? ? ? "; // two spaces for alignment

        for (let r = 0; r < rowsToRender; r++) {
          const activeCol = fallHistory?.[r] ?? landedPath?.[r] ?? null;

          let line = "";
          for (let c = 0; c < slots; c++) {
            line += (c === activeCol ? "??" : "?") + SPACING;
          }
          rowsTxt.push(line.trimEnd());
        }

        // build multiplier row
        let multLine = "-# ";
        for (let c = 0; c < slots; c++) {
          multLine +=
            `x${slotMults[c].toFixed(2)}` + (c === slots - 1 ? "" : " | ");
        }

        return rowsTxt.join("\n") + "\n" + multLine;
      }

      async function mainEmbed({ title, extraText, fallHistory, landedPath }) {
        const embed = await getUserEmbed(userId, title || "Plinko");

        // last result block (after a ball finished)
        let lastResultBlock = "";
        if (lastPath.length && lastFinalMult !== null) {
          const sign = lastGain >= 0 ? "+" : "-";
          lastResultBlock =
            `\n\n?? ${await translateText("Last drop", lang)}:\n` +
            `${await translateText("Bet used", lang)}: **${abbreviate(lastBetUsed, "prefix")} ${currency}**\n` +
            `${await translateText("Payout", lang)}: x${lastFinalMult.toFixed(2)}\n` +
            `${await translateText("Result", lang)}: **${sign}${abbreviate(Math.abs(lastGain), "prefix")} ${currency}**`;
        }

        embed.setDescription(
          `${await translateText("?? Plinko Game", lang)}\n` +
            `${await translateText("Drop amount", lang)}: **${abbreviate(currentBet, "prefix")} ${currency}**\n` +
            `${await translateText("Slots", lang)}: ${slots}\n` +
            `?? ${await translateText("Balance", lang)}: **${abbreviate(userData.cash, "prefix")} ${currency}**\n` +
            renderBoard(fallHistory, landedPath) +
            (extraText ? `\n\n${extraText}` : "") +
            lastResultBlock +
            `\n\n?? ${await translateText("Total session result", lang)}: ` +
            `**${netGain >= 0 ? "+" : "-"}${abbreviate(Math.abs(netGain), "prefix")} ${currency}**`,
        );

        return embed;
      }

      async function stoppedEmbed() {
        const embed = await getUserEmbed(userId, "Plinko Ended");
        embed.setDescription(
          `${await translateText("Game stopped.", lang)}\n` +
            `${await translateText("Net result", lang)}: **${netGain >= 0 ? "+" : "-"}${abbreviate(Math.abs(netGain), "prefix")} ${currency}**`,
        );
        return embed;
      }

      // button builder
      async function makeButtons() {
        const add50 = new ButtonBuilder()
          .setCustomId("pl_add50")
          .setLabel("+50")
          .setStyle(ButtonStyle.Secondary);
        const add100 = new ButtonBuilder()
          .setCustomId("pl_add100")
          .setLabel("+100")
          .setStyle(ButtonStyle.Secondary);
        const mult2 = new ButtonBuilder()
          .setCustomId("pl_mult2")
          .setLabel("x2")
          .setStyle(ButtonStyle.Secondary);
        const div2 = new ButtonBuilder()
          .setCustomId("pl_div2")
          .setLabel("÷2")
          .setStyle(ButtonStyle.Secondary);

        const drop = new ButtonBuilder()
          .setCustomId("pl_drop")
          .setLabel(await translateText("Drop Ball", lang))
          .setStyle(ButtonStyle.Success);
        const stop = new ButtonBuilder()
          .setCustomId("pl_stop")
          .setLabel(await translateText("Stop Game", lang))
          .setStyle(ButtonStyle.Danger);

        if (stopped) {
          [add50, add100, mult2, div2, drop, stop].forEach((b) =>
            b.setDisabled(true),
          );
        }

        // during drop, edit bet + drop are locked, but stop still shown (we'll block stop in code if mid-drop)
        if (dropping) {
          [add50, add100, mult2, div2, drop].forEach((b) =>
            b.setDisabled(true),
          );
        }

        try {
          const ecoDataNow = JSON.parse(fs.readFileSync(ecoPath, "utf8"));
          if (ecoDataNow[userId]) {
            // copy all properties from the latest data
            Object.assign(userData, ecoDataNow[userId]);
          }
        } catch (err) {
          console.error("Balance reload failed:", err);
        }

        // balance limits (only if not dropping and not stopped)
        if (!dropping && !stopped) {
          if (currentBet + 50 > userData.cash) add50.setDisabled(true);
          if (currentBet + 100 > userData.cash) add100.setDisabled(true);
          if (currentBet * 2 > userData.cash) mult2.setDisabled(true);
          if (Math.floor(currentBet / 2) < 100) div2.setDisabled(true);

          if (currentBet < 100 || currentBet > userData.cash) {
            drop.setDisabled(true);
          }
        }

        const row1 = new ActionRowBuilder().addComponents(
          add50,
          add100,
          mult2,
          div2,
        );
        const row2 = new ActionRowBuilder().addComponents(drop, stop);
        return [row1, row2];
      }

      // send initial board
      let rowsForMessage = await makeButtons();
      let startEmb = await mainEmbed({
        fallHistory: [],
        landedPath: lastPath,
        extraText: null,
      });
      const msg = await interaction.editReply({
        embeds: [startEmb],
        components: rowsForMessage,
      });

      // helper to live-update message safely
      async function pushUpdate(fallHistory, textHint) {
        rowsForMessage = await makeButtons();
        const emb = await mainEmbed({
          fallHistory,
          landedPath: lastPath,
          extraText: textHint || null,
        });
        await interaction
          .editReply({ embeds: [emb], components: rowsForMessage })
          .catch(() => {});
      }

      // helper after game fully ends or stop
      async function pushStopped() {
        const emb = await stoppedEmbed();
        await interaction
          .editReply({ embeds: [emb], components: [] })
          .catch(() => {});
      }

      // simulate a single drop
      async function runDrop() {
        dropping = true;
        lastPath = []; // clear last shown ball while dropping
        lastFinalMult = null; // will be filled after land

        // double-check balance + min
        if (currentBet < 100 || currentBet > userData.cash) {
          dropping = false;
          return;
        }

        // take bet from wallet NOW
        userData.cash -= currentBet;
        save(ecoPath, data);
        lastBetUsed = currentBet;

        // starting column ~ center
        let pos = Math.floor((slots - 1) / 2);
        const totalSteps = slots; // how many "rows" we render (so board height == slots)

        for (let step = 0; step < totalSteps; step++) {
          // record position at this row
          lastPath[step] = pos;

          // update message to show full fall history so far
          await pushUpdate(
            lastPath,
            await translateText("Ball dropping...", lang),
          );

          // wait a bit
          await new Promise((r) => setTimeout(r, 300)); // faster ball

          // if not last row yet, move horizontally for next row
          if (step < totalSteps - 1) {
            const centerIndex = (slots - 1) / 2;

            // --- Base luck bias ---
            let goRightBias = 0.5;
            if (pos === centerIndex) goRightBias += luckBonus / 400;
            else if (pos < centerIndex) goRightBias -= luckBonus / 650;
            else goRightBias += luckBonus / 650;

            // --- Stronger position balancing (harder to reach edges)
            const distFromCenter = (pos - centerIndex) / centerIndex; // -1 (left) ? +1 (right)
            const balance = Math.abs(distFromCenter) * 0.45; // stronger correction
            if (pos < centerIndex)
              goRightBias += balance; // far left ? more chance to go right
            else if (pos > centerIndex) goRightBias -= balance; // far right ? more chance to go left

            // clamp bias (so it doesn’t go extreme)
            goRightBias = Math.max(0.2, Math.min(0.8, goRightBias));

            // --- Straight drop chance ---
            // more toward edge = much higher chance to go straight
            const straightChance = 0.35 + Math.abs(distFromCenter) * 0.35; // 0.35–0.7

            const roll = Math.random();
            if (roll < straightChance) {
              // straight down
            } else if (Math.random() < goRightBias) {
              pos += 1;
            } else {
              pos -= 1;
            }

            if (pos < 0) pos = 0;
            if (pos > slots - 1) pos = slots - 1;
          }
        }

        const baseMult = Number(slotMults[pos].toFixed(2));
        const finalMult = baseMult; // no payout luck bonus

        lastFinalMult = finalMult;
        const totalWon = Math.round(lastBetUsed * finalMult);

        // gain/loss for this ball
        const gainThis = totalWon - lastBetUsed;
        lastGain = gainThis;
        netGain += gainThis;

        // pay result
        userData.cash += totalWon;
        save(ecoPath, data);

        if (currentBet > userData.cash) {
          currentBet = Math.max(100, Math.floor(userData.cash / 2));
          await pushUpdate(
            lastPath,
            await translateText("Bet adjusted due to low balance.", lang),
          );
        }

        dropping = false;

        // now freeze path (so they see final landing ball)
        await pushUpdate(lastPath, await translateText("Ball landed!", lang));

        // after landing, buttons re-enable (Drop/Stop + bet edits), and they see:
        // - last drop info (we show in mainEmbed() using lastPath/lastBetUsed/lastFinalMult/lastGain)
        rowsForMessage = await makeButtons();
        const landedEmbed = await mainEmbed({
          fallHistory: [], // no live fall now
          landedPath: lastPath, // freeze last path
          extraText: await translateText("Ball landed!", lang),
        });
        await interaction
          .editReply({ embeds: [landedEmbed], components: rowsForMessage })
          .catch(() => {});
      }

      // button collector
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60_000,
      });

      collector.on("collect", async (i) => {
        if (i.user.id !== userId) {
          return i.reply({
            content: await translateText("This is not your game.", lang),
            ephemeral: true,
          });
        }

        if (stopped) {
          await i.deferUpdate().catch(() => {});
          return;
        }

        if (i.customId === "pl_stop") {
          // only allow stop if not mid-drop
          if (dropping) {
            return i.reply({
              content: await translateText(
                "Wait until the ball stops dropping.",
                lang,
              ),
              ephemeral: true,
            });
          }
          stopped = true;
          await i.deferUpdate().catch(() => {});
          await pushStopped();
          return;
        }

        // if ball is currently falling, block edits/drop
        if (dropping) {
          await i.deferUpdate().catch(() => {});
          return;
        }

        try {
          const ecoDataNow = JSON.parse(fs.readFileSync(ecoPath, "utf8"));
          if (ecoDataNow[userId]) {
            // copy all properties from the latest data
            Object.assign(userData, ecoDataNow[userId]);
          }
        } catch (err) {
          console.error("Balance reload failed:", err);
        }

        // --- Auto-fix bet if it exceeds balance ---
        if (currentBet > userData.cash) {
          currentBet = Math.max(100, Math.floor(userData.cash / 2));
          await pushUpdate(
            lastPath,
            await translateText("Bet adjusted to your current balance.", lang),
          );
        }

        rowsForMessage = await makeButtons();
        const updEmbed1 = await mainEmbed({
          fallHistory: [],
          landedPath: lastPath,
          extraText: await translateText("Balance updated.", lang),
        });
        await interaction
          .editReply({ embeds: [updEmbed1], components: rowsForMessage })
          .catch(() => {});

        // bet adjust
        if (i.customId === "pl_add50") currentBet += 50;
        if (i.customId === "pl_add100") currentBet += 100;
        if (i.customId === "pl_mult2") currentBet *= 2;
        if (i.customId === "pl_div2") currentBet = Math.floor(currentBet / 2);

        if (i.customId === "pl_drop") {
          // validate bet before starting
          if (currentBet < 100) {
            return i.reply({
              content: await translateText("Minimum drop is 100 Cash.", lang),
              ephemeral: true,
            });
          }
          if (currentBet > userData.cash) {
            return i.reply({
              content: await translateText("Not enough balance.", lang),
              ephemeral: true,
            });
          }

          await i.deferUpdate().catch(() => {});

          // run the ball async-ish in-series
          await runDrop();
          return;
        }

        // normal UI refresh after changing bet (no drop)
        await i.deferUpdate().catch(() => {});
        rowsForMessage = await makeButtons();
        const updEmbed = await mainEmbed({
          fallHistory: [],
          landedPath: lastPath,
          extraText: null,
        });
        await interaction
          .editReply({ embeds: [updEmbed], components: rowsForMessage })
          .catch(() => {});
      });

      collector.on("end", async () => {
        if (!stopped) {
          // auto stop -> return netGain is already applied live, so just close UI
          stopped = true;
          await pushStopped();
        }
      });
    }

    // ---------- TOWER ----------
    if (sub === "tower") {
      const betArg = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      let cols = interaction.options.getInteger("columns") || 3;
      let maxLevels = interaction.options.getInteger("levels") || 8;
      if (cols < 3 || cols > 5) cols = 3;
      if (maxLevels < 3) maxLevels = 3;
      if (maxLevels > 10) maxLevels = 10;

      if (betArg < 100 || betArg > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Minimum bet is 100 Cash and you must have enough balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const luckBonus = getGambleLuckBonusPercent(userData) || 0;
      let currentLevel = 0;
      let stopped = false;
      let multiplier = 1.0;
      let currentBet = betArg;
      let netGain = 0;
      const levels = [];

      // payout growth: fewer columns = higher reward
      const payoutGrowth = { 3: 1.65, 4: 1.45, 5: 1.3 };

      userData.cash -= currentBet;
      save(ecoPath, data);

      // one bomb per layer
      const bombIndexes = [];
      for (let i = 0; i < maxLevels; i++)
        bombIndexes.push(Math.floor(Math.random() * cols));

      // render board
      function renderBoard(showSolution = false, reveal = false) {
        const rows = [];
        for (let i = maxLevels - 1; i >= 0; i--) {
          let row = "";
          for (let c = 0; c < cols; c++) {
            const isCurrent = i === currentLevel && !stopped && !reveal;
            const chosen = levels[i];
            const bomb = bombIndexes[i];

            if (showSolution) {
              // final reveal (full safe/bomb)
              row += c === bomb ? "?? " : "?? ";
            } else if (chosen !== undefined) {
              // this layer was played
              if (chosen === bomb) row += c === chosen ? "?? " : "? ";
              else row += c === chosen ? "?? " : "? ";
            } else if (isCurrent) {
              row += "? ";
            } else {
              row += "? ";
            }
          }
          rows.push(row.trim());
        }
        return rows.join("\n");
      }

      async function makeButtons(disabled = false) {
        const row = new ActionRowBuilder();
        for (let i = 0; i < cols; i++) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`tower_${i}`)
              .setLabel(["Left", "Middle", "Right", "4", "5"][i])
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled),
          );
        }
        const cash = new ButtonBuilder()
          .setCustomId("tower_cashout")
          .setLabel(await translateText("Cash Out", lang))
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled || currentLevel === 0);
        const stop = new ButtonBuilder()
          .setCustomId("tower_stop")
          .setLabel(await translateText("Stop Game", lang))
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled);
        const row2 = new ActionRowBuilder().addComponents(cash, stop);
        return [row, row2];
      }

      async function updateEmbed(
        extraText,
        showSolution = false,
        reveal = false,
      ) {
        const embed = await getUserEmbed(userId, "Tower");
        const potential = abbreviate(
          Math.floor(currentBet * multiplier),
          "prefix",
        );
        embed.setDescription(
          `${await translateText("?? Tower Game", lang)}\n` +
            `${await translateText("Level", lang)}: **${currentLevel}/${maxLevels}**\n` +
            `${await translateText("Columns", lang)}: ${cols}\n\n` +
            renderBoard(showSolution, reveal) +
            "\n\n" +
            `${await translateText("?? Bet", lang)}: **${abbreviate(currentBet, "prefix")} ${currency}**\n` +
            `${await translateText("Payout", lang)}: x${multiplier.toFixed(2)} (${potential} ${currency})` +
            (extraText ? `\n\n${extraText}` : ""),
        );
        return embed;
      }

      let msg = await interaction.editReply({
        embeds: [
          await updateEmbed(await translateText("Pick a safe tile!", lang)),
        ],
        components: await makeButtons(),
      });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 3 * 60_000,
      });

      collector.on("collect", async (i) => {
        if (i.user.id !== userId) {
          return i.reply({
            content: await translateText("This is not your game.", lang),
            ephemeral: true,
          });
        }

        // ?? Always defer to avoid interaction timeout
        await i.deferUpdate().catch(() => {});

        if (stopped) return;

        // --- Cash Out ---
        if (i.customId === "tower_cashout") {
          stopped = true;
          const total = Math.floor(currentBet * multiplier);
          const gain = total - currentBet;
          netGain += gain;
          userData.cash += total;
          save(ecoPath, data);

          // Step 1: show "cashing out..."
          await interaction.editReply({
            embeds: [
              await updateEmbed(await translateText("?? Cashing out...", lang)),
            ],
            components: await makeButtons(true),
          });

          await new Promise((r) => setTimeout(r, 3000)); // wait 4s
          await interaction.editReply({
            embeds: [
              await updateEmbed(
                await translateText("Revealing tower...", lang),
                true,
                true,
              ),
            ],
            components: await makeButtons(true),
          });

          await new Promise((r) => setTimeout(r, 8000)); // reveal stays 8s
          const emb = await getUserEmbed(userId, "Tower Cashed Out");
          emb.setDescription(
            `${await translateText("? Cashed out successfully!", lang)}\n\n` +
              `${await translateText("Final Multiplier", lang)}: x${multiplier.toFixed(2)}\n` +
              `${await translateText("Result", lang)}: **+${abbreviate(gain, "prefix")} ${currency}**`,
          );
          await interaction.editReply({ embeds: [emb], components: [] });
          collector.stop();
          return;
        }

        // --- Stop Game ---
        if (i.customId === "tower_stop") {
          stopped = true;
          const emb = await getUserEmbed(userId, "Tower Ended");
          emb.setDescription(
            `${await translateText("Game stopped.", lang)}\n` +
              `${await translateText("Total result", lang)}: **${netGain >= 0 ? "+" : "-"}${abbreviate(Math.abs(netGain), "prefix")} ${currency}**`,
          );
          await interaction.editReply({ embeds: [emb], components: [] });
          collector.stop();
          return;
        }

        // --- Tile Click ---
        const index = parseInt(i.customId.split("_")[1]);
        levels[currentLevel] = index;
        const bomb = bombIndexes[currentLevel];

        // Show initial reveal
        await interaction.editReply({
          embeds: [
            await updateEmbed(await translateText("Revealing...", lang)),
          ],
          components: await makeButtons(true),
        });

        await new Promise((r) => setTimeout(r, 500));

        if (index !== bomb) {
          // ? Safe
          currentLevel++;
          multiplier *= payoutGrowth[cols];

          // show only clicked tile green
          await interaction.editReply({
            embeds: [await updateEmbed(await translateText("?? Safe!", lang))],
            components: await makeButtons(true),
          });

          await new Promise((r) => setTimeout(r, 700));

          if (currentLevel >= maxLevels) {
            // Reached top
            stopped = true;
            const total = Math.floor(currentBet * multiplier);
            const gain = total - currentBet;
            netGain += gain;
            userData.cash += total;
            save(ecoPath, data);

            await interaction.editReply({
              embeds: [
                await updateEmbed(
                  await translateText("?? Tower complete! Revealing...", lang),
                  true,
                  true,
                ),
              ],
              components: await makeButtons(true),
            });

            await new Promise((r) => setTimeout(r, 8000)); // show reveal

            const emb = await getUserEmbed(userId, "Tower Complete!");
            emb.setDescription(
              `${await translateText("You reached the top!", lang)}\n\n` +
                `${await translateText("Final Multiplier", lang)}: x${multiplier.toFixed(2)}\n` +
                `${await translateText("Result", lang)}: **+${abbreviate(gain, "prefix")} ${currency}**`,
            );
            await interaction.editReply({ embeds: [emb], components: [] });
            collector.stop();
          } else {
            await interaction.editReply({
              embeds: [
                await updateEmbed(await translateText("Pick next tile!", lang)),
              ],
              components: await makeButtons(),
            });
          }
        } else {
          // ?? Bomb hit
          stopped = true;

          // 1?? show bomb layer only
          await interaction.editReply({
            embeds: [
              await updateEmbed(
                await translateText("?? Bomb hit!", lang),
                false,
                true,
              ),
            ],
            components: await makeButtons(true),
          });

          // 2?? wait 4s, reveal all
          await new Promise((r) => setTimeout(r, 3000));
          await interaction.editReply({
            embeds: [
              await updateEmbed(
                await translateText("Revealing tower...", lang),
                true,
                true,
              ),
            ],
            components: await makeButtons(true),
          });

          // 3?? wait 8s, then summary
          await new Promise((r) => setTimeout(r, 8000));
          const emb = await getUserEmbed(userId, "Bomb!");
          emb.setDescription(
            `${await translateText("You hit a bomb!", lang)}\n\n` +
              `${await translateText("Final Multiplier", lang)}: x${multiplier.toFixed(2)}\n` +
              `${await translateText("Result", lang)}: **-${abbreviate(currentBet, "prefix")} ${currency}**`,
          );
          await interaction.editReply({ embeds: [emb], components: [] });
          collector.stop();
        }
      });

      collector.on("end", async () => {
        if (!stopped) {
          stopped = true;
          const emb = await getUserEmbed(userId, "Tower Ended");
          emb.setDescription(
            `${await translateText("Game stopped.", lang)}\n` +
              `${await translateText("Total result", lang)}: **${netGain >= 0 ? "+" : "-"}${abbreviate(Math.abs(netGain), "prefix")} ${currency}**`,
          );
          await interaction
            .editReply({ embeds: [emb], components: [] })
            .catch(() => {});
        }
      });
    }

    // ---------- KENO ----------
    if (sub === "keno") {
      const betArg = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      if (betArg < 100 || betArg > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Minimum bet is 100 Cash and you must have enough balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const luckBonus = getGambleLuckBonusPercent(userData) || 0;
      const gridSize = 4; // 4x4 grid
      const maxPicks = 6;
      const totalDraws = 8;
      const allNumbers = Array.from(
        { length: gridSize * gridSize },
        (_, i) => i + 1,
      );
      const chosen = new Set();
      let drawing = false;
      let canceled = false;
      let finished = false;

      const rewardTable = {
        0: 0,
        1: 0.25,
        2: 0.7,
        3: 1.5,
        4: 3.5,
        5: 8,
        6: 18,
      };

      // Deduct bet upfront
      userData.cash -= betArg;
      save(ecoPath, data);

      // ---------------- GRID RENDER ----------------
      async function renderGrid(revealed = [], hitsList = []) {
        const rows = [];
        for (let r = 0; r < gridSize; r++) {
          const row = new ActionRowBuilder();
          for (let c = 0; c < gridSize; c++) {
            const n = r * gridSize + c + 1;
            let style = ButtonStyle.Secondary;
            if (chosen.has(n) && !revealed.includes(n))
              style = ButtonStyle.Primary;
            if (revealed.includes(n) && chosen.has(n))
              style = ButtonStyle.Success;
            if (revealed.includes(n) && !chosen.has(n))
              style = ButtonStyle.Danger;
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`keno_${n}`)
                .setLabel(n.toString())
                .setStyle(style)
                .setDisabled(drawing || canceled || finished),
            );
          }
          rows.push(row);
        }

        const randomPickBtn = new ButtonBuilder()
          .setCustomId("keno_random")
          .setLabel(await translateText("?? Random Pick", lang))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(drawing || canceled || finished);

        const playBtn = new ButtonBuilder()
          .setCustomId("keno_play")
          .setLabel(await translateText("Play", lang))
          .setStyle(ButtonStyle.Success)
          .setDisabled(drawing || canceled || finished || chosen.size === 0);

        const cancelBtn = new ButtonBuilder()
          .setCustomId("keno_cancel")
          .setLabel(await translateText("Cancel", lang))
          .setStyle(ButtonStyle.Danger)
          .setDisabled(drawing || finished || canceled);

        rows.push(
          new ActionRowBuilder().addComponents(
            randomPickBtn,
            playBtn,
            cancelBtn,
          ),
        );
        return rows;
      }

      // ---------------- EMBED ----------------
      async function updateEmbed(statusText = "", revealed = [], hits = 0) {
        const e = await getUserEmbed(userId, "Keno");
        e.setDescription(
          `${await translateText("Pick up to 6 spots and press Play.", lang)}\n\n` +
            `${await translateText("?? Bet", lang)}: **${abbreviate(betArg, "prefix")} ${currency}**\n` +
            `${await translateText("?? Picks", lang)}: ${chosen.size}/6\n` +
            `${await translateText("?? Luck bonus", lang)}: +${luckBonus}%\n` +
            (statusText ? `\n${statusText}` : "") +
            (revealed.length
              ? `\n\n${await translateText("?? Draws", lang)}: ${revealed.join(", ")}`
              : ""),
        );
        return e;
      }

      const msg = await interaction.editReply({
        embeds: [await updateEmbed()],
        components: await renderGrid(),
      });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 3 * 60_000,
      });

      // ---------------- COLLECTOR ----------------
      collector.on("collect", async (i) => {
        if (i.user.id !== userId) {
          return i.reply({
            content: await translateText("This is not your game.", lang),
            ephemeral: true,
          });
        }
        await i.deferUpdate().catch(() => {});
        if (finished) return;

        const id = i.customId;

        // ---- Cancel Game ----
        if (id === "keno_cancel" && !drawing) {
          canceled = true;
          userData.cash += betArg;
          save(ecoPath, data);
          const e = await getUserEmbed(userId, "Keno Canceled");
          e.setDescription(
            `${await translateText("You canceled the game before it started.", lang)}\n` +
              `${await translateText("Refunded", lang)}: **${abbreviate(betArg, "prefix")} ${currency}**`,
          );
          await interaction.editReply({ embeds: [e], components: [] });
          collector.stop();
          return;
        }

        // ---- Random Pick ----
        if (id === "keno_random" && !drawing && !canceled) {
          chosen.clear();
          while (chosen.size < maxPicks) {
            chosen.add(
              allNumbers[Math.floor(Math.random() * allNumbers.length)],
            );
          }
          await interaction.editReply({
            embeds: [
              await updateEmbed(
                await translateText("?? Random spots selected.", lang),
              ),
            ],
            components: await renderGrid(),
          });
          return;
        }

        // ---- Start Game ----
        if (id === "keno_play" && !drawing && !canceled) {
          drawing = true;

          await interaction.editReply({
            embeds: [
              await updateEmbed(
                await translateText("?? Drawing starting...", lang),
              ),
            ],
            components: await renderGrid(),
          });
          await new Promise((r) => setTimeout(r, 1000));

          const revealed = [];
          const hitsList = [];

          for (let d = 0; d < totalDraws; d++) {
            const remaining = allNumbers.filter((n) => !revealed.includes(n));
            let roll;

            // Luck effect
            if (Math.random() < luckBonus / 400 && chosen.size > 0) {
              const unhit = [...chosen].filter((n) => !revealed.includes(n));
              roll =
                unhit.length > 0
                  ? unhit[Math.floor(Math.random() * unhit.length)]
                  : remaining[Math.floor(Math.random() * remaining.length)];
            } else {
              roll = remaining[Math.floor(Math.random() * remaining.length)];
            }

            revealed.push(roll);
            if (chosen.has(roll)) hitsList.push(roll);

            await interaction.editReply({
              embeds: [
                await updateEmbed(
                  await translateText("?? Drawing...", lang),
                  revealed,
                  hitsList.length,
                ),
              ],
              components: await renderGrid(revealed, hitsList),
            });
            await new Promise((r) => setTimeout(r, 300));
          }

          const hits = hitsList.length;
          const baseMult = rewardTable[hits] || 0;
          const finalMult = baseMult * (1 + luckBonus / 100);
          const win = Math.floor(betArg * finalMult);
          const gain = win - betArg;

          // --- Wait 6s before summary ---
          await interaction.editReply({
            embeds: [
              await updateEmbed(
                await translateText("?? Final results showing soon...", lang),
                revealed,
                hits,
              ),
            ],
            components: await renderGrid(revealed, hitsList),
          });

          await new Promise((r) => setTimeout(r, 6000));
          finished = true;

          let resultEmbed;
          if (win > 0) {
            userData.cash += win;
            save(ecoPath, data);
            resultEmbed = await getUserEmbed(userId, "Keno Win!");
            resultEmbed.setDescription(
              `${await translateText("?? You hit", lang)} ${hits}!\n` +
                `${await translateText("Multiplier", lang)}: x${finalMult.toFixed(2)}\n` +
                `${await translateText("?? Bet", lang)}: ${abbreviate(betArg, "prefix")} ${currency}\n` +
                `${await translateText("Result", lang)}: **+${abbreviate(gain, "prefix")} ${currency}**\n\n` +
                `${await translateText("New Balance", lang)}: **${abbreviate(userData.cash, "prefix")} ${currency}**`,
            );
          } else {
            resultEmbed = await getUserEmbed(userId, "Keno Lost");
            resultEmbed.setDescription(
              `${await translateText("?? You hit", lang)} ${hits}.\n` +
                `${await translateText("No winnings this time.", lang)}\n\n` +
                `${await translateText("?? Bet", lang)}: ${abbreviate(betArg, "prefix")} ${currency}\n` +
                `${await translateText("Result", lang)}: **-${abbreviate(Math.abs(gain), "prefix")} ${currency}**\n\n` +
                `${await translateText("New Balance", lang)}: **${abbreviate(userData.cash, "prefix")} ${currency}**`,
            );
          }

          await interaction.editReply({
            embeds: [resultEmbed],
            components: [],
          });
          collector.stop();
          return;
        }

        // ---- Tile Selection / Unpick ----
        const num = parseInt(id.split("_")[1]);
        if (!drawing && !isNaN(num)) {
          if (chosen.has(num)) {
            chosen.delete(num); // unpick if already selected
          } else if (chosen.size < maxPicks) {
            chosen.add(num); // pick new number
          }
          await interaction.editReply({
            embeds: [await updateEmbed()],
            components: await renderGrid(),
          });
        }
      });

      collector.on("end", async () => {
        if (!canceled && !finished && !drawing) {
          const e = await getUserEmbed(userId, "Keno Ended");
          e.setDescription(
            `${await translateText("Time ran out before you started the game.", lang)}\n\n` +
              `${await translateText("Refunded", lang)}: **${abbreviate(betArg, "prefix")} ${currency}**`,
          );
          userData.cash += betArg;
          save(ecoPath, data);
          await interaction
            .editReply({ embeds: [e], components: [] })
            .catch(() => {});
        }
      });
    }

    // ---------- HILO ----------
    if (sub === "hilo") {
      const betArg = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      if (betArg < 100 || betArg > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Minimum bet is 100 Cash and you must have enough balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const luckBonus = getGambleLuckBonusPercent(userData) || 0;
      const suits = ["??", "??", "??", "??"];
      const deck = [];
      for (let v = 1; v <= 13; v++) {
        for (let s of suits) deck.push({ v, s });
      }

      const valueToString = (v) => {
        if (v === 1) return "A";
        if (v === 11) return "J";
        if (v === 12) return "Q";
        if (v === 13) return "K";
        return v.toString();
      };

      const drawCard = () => deck[Math.floor(Math.random() * deck.length)];

      // Deduct bet
      userData.cash -= betArg;
      save(ecoPath, data);

      const currentCard = drawCard();
      let finished = false;
      let canceled = false;

      const e = await getUserEmbed(userId, "Hi-Lo");
      e.setDescription(
        `${await translateText("Will the next card be higher or lower?", lang)}\n\n` +
          `${await translateText("?? Bet", lang)}: **${abbreviate(betArg, "prefix")} ${currency}**\n` +
          `${await translateText("?? Luck bonus", lang)}: +${luckBonus}%\n\n` +
          `${await translateText("Current card", lang)}: **${valueToString(currentCard.v)} ${currentCard.s}**`,
      );

      const higher = new ButtonBuilder()
        .setCustomId("hilo_high")
        .setLabel(await translateText("Higher", lang))
        .setStyle(ButtonStyle.Success);
      const lower = new ButtonBuilder()
        .setCustomId("hilo_low")
        .setLabel(await translateText("Lower", lang))
        .setStyle(ButtonStyle.Danger);
      const cancel = new ButtonBuilder()
        .setCustomId("hilo_cancel")
        .setLabel(await translateText("Cancel", lang))
        .setStyle(ButtonStyle.Secondary);

      const msg = await interaction.editReply({
        embeds: [e],
        components: [
          new ActionRowBuilder().addComponents(higher, lower, cancel),
        ],
      });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60_000,
      });

      collector.on("collect", async (i) => {
        if (i.user.id !== userId)
          return i.reply({
            content: await translateText("This is not your game.", lang),
            ephemeral: true,
          });
        await i.deferUpdate().catch(() => {});
        if (finished) return;

        if (i.customId === "hilo_cancel") {
          canceled = true;
          userData.cash += betArg;
          save(ecoPath, data);
          const end = await getUserEmbed(userId, "Hi-Lo Canceled");
          end.setDescription(
            `${await translateText("Game canceled. Refund:", lang)} **${abbreviate(betArg, "prefix")} ${currency}**`,
          );
          await interaction.editReply({ embeds: [end], components: [] });
          collector.stop();
          return;
        }

        finished = true;
        const nextCard = drawCard();
        let win = false;

        if (i.customId === "hilo_high") {
          win = nextCard.v > currentCard.v;
          if (Math.random() < luckBonus / 300) win = true;
        } else if (i.customId === "hilo_low") {
          win = nextCard.v < currentCard.v;
          if (Math.random() < luckBonus / 300) win = true;
        }

        const multiplier = win ? 2 : 0;
        const total = Math.floor(betArg * multiplier);
        const gain = total - betArg;
        if (win) userData.cash += total;
        save(ecoPath, data);

        const reveal = await getUserEmbed(userId, "Hi-Lo");
        reveal.setDescription(
          `${await translateText("Next card was", lang)}: **${valueToString(nextCard.v)} ${nextCard.s}**\n` +
            `${await translateText("Checking result...", lang)}`,
        );
        await interaction.editReply({ embeds: [reveal], components: [] });

        await new Promise((r) => setTimeout(r, 3500));

        const result = await getUserEmbed(userId, win ? "Win!" : "Lost");
        result.setDescription(
          `${await translateText("Your guess:", lang)} ${i.customId === "hilo_high" ? "Higher" : "Lower"}\n` +
            `${await translateText("Next card:", lang)} **${valueToString(nextCard.v)} ${nextCard.s}**\n\n` +
            `${await translateText("?? Bet", lang)}: ${abbreviate(betArg, "prefix")} ${currency}\n` +
            `${await translateText("Result", lang)}: **${win ? "+" : "-"}${abbreviate(Math.abs(gain), "prefix")} ${currency}**\n\n` +
            `${await translateText("New Balance", lang)}: **${abbreviate(userData.cash, "prefix")} ${currency}**`,
        );
        await interaction.editReply({ embeds: [result], components: [] });
        collector.stop();
      });

      collector.on("end", async () => {
        if (!finished && !canceled) {
          const end = await getUserEmbed(userId, "Hi-Lo Ended");
          end.setDescription(
            `${await translateText("Time ran out, refunded", lang)}: **${abbreviate(betArg, "prefix")} ${currency}**`,
          );
          userData.cash += betArg;
          save(ecoPath, data);
          await interaction
            .editReply({ embeds: [end], components: [] })
            .catch(() => {});
        }
      });
    }

    // ---------- DICE ----------
    if (sub === "dice") {
      const betArg = parseEcoAmountInput(interaction.options.getString("amount"), userData.cash);
      if (betArg < 100 || betArg > userData.cash) {
        const e = await getUserEmbed(userId, null, "error");
        e.setDescription(
          await translateText(
            "Minimum bet is 100 Cash and you must have enough balance.",
            lang,
          ),
        );
        return interaction.editReply({ embeds: [e] });
      }

      const luckBonus = getGambleLuckBonusPercent(userData) || 0;
      userData.cash -= betArg;
      save(ecoPath, data);

      const rollUnder = Math.floor(Math.random() * 50) + 25;
      const e = await getUserEmbed(userId, "Dice Game");
      e.setDescription(
        `${await translateText("Guess if the roll will be under or over the target number.", lang)}\n\n` +
          `${await translateText("?? Target", lang)}: **${rollUnder}**\n` +
          `${await translateText("?? Bet", lang)}: **${abbreviate(betArg, "prefix")} ${currency}**\n` +
          `${await translateText("?? Luck bonus", lang)}: +${luckBonus}%`,
      );

      const under = new ButtonBuilder()
        .setCustomId("dice_under")
        .setLabel(await translateText("Under", lang))
        .setStyle(ButtonStyle.Success);
      const over = new ButtonBuilder()
        .setCustomId("dice_over")
        .setLabel(await translateText("Over", lang))
        .setStyle(ButtonStyle.Danger);
      const cancel = new ButtonBuilder()
        .setCustomId("dice_cancel")
        .setLabel(await translateText("Cancel", lang))
        .setStyle(ButtonStyle.Secondary);

      const msg = await interaction.editReply({
        embeds: [e],
        components: [new ActionRowBuilder().addComponents(under, over, cancel)],
      });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 50 * 60_000,
      });
      let gameEnded = false;

      collector.on("collect", async (i) => {
        if (i.user.id !== userId)
          return i.reply({
            content: await translateText("This is not your game.", lang),
            ephemeral: true,
          });
        await i.deferUpdate().catch(() => {});

        // Cancel button
        if (i.customId === "dice_cancel") {
          gameEnded = true;
          userData.cash += betArg;
          save(ecoPath, data);
          const end = await getUserEmbed(userId, "Dice Canceled");
          end.setDescription(
            `${await translateText("Game canceled. Refund:", lang)} **${abbreviate(betArg, "prefix")} ${currency}**`,
          );
          await interaction.editReply({ embeds: [end], components: [] });
          collector.stop();
          return;
        }

        const roll = Math.floor(Math.random() * 101);
        let win =
          i.customId === "dice_under" ? roll < rollUnder : roll > rollUnder;
        if (Math.random() < luckBonus / 350) win = true;

        const multiplier = win ? 2 : 0;
        const total = Math.floor(betArg * multiplier);
        const gain = total - betArg;
        if (win) userData.cash += total;
        save(ecoPath, data);

        // ?? Animation
        //math.random(1, 101)
        const diceFaces = ["?", "?", "?", "?", "?", "?"];
        const rollEmbed = await getUserEmbed(userId, "Rolling...");
        rollEmbed.setDescription(
          `${await translateText("The dice is rolling...", lang)}\n${Math.floor(Math.random() * 101)}`,
        );
        await interaction.editReply({ embeds: [rollEmbed], components: [] });

        for (let j = 1; j < 10; j++) {
          const face = diceFaces[Math.floor(Math.random() * diceFaces.length)];
          rollEmbed.setDescription(
            `${await translateText("The dice is rolling...", lang)}\n${Math.floor(Math.random() * 101)}`,
          );
          await interaction.editReply({ embeds: [rollEmbed] });
          await new Promise((r) => setTimeout(r, 300));
        }

        // suspenseful final shake
        rollEmbed.setDescription(
          `${await translateText("Almost there...", lang)} ??`,
        );
        await interaction.editReply({ embeds: [rollEmbed] });
        await new Promise((r) => setTimeout(r, 500));

        rollEmbed.setDescription(
          `${await translateText("Final roll...", lang)} ??`,
        );
        await interaction.editReply({ embeds: [rollEmbed] });
        await new Promise((r) => setTimeout(r, 600));

        // ?? Result
        const result = await getUserEmbed(
          userId,
          win ? "You won!" : "You lost",
        );
        result.setDescription(
          `${await translateText("Your guess", lang)}: **${i.customId === "dice_under" ? "Under" : "Over"}**\n` +
            `${await translateText("?? Target", lang)}: **${rollUnder}**\n` +
            `${await translateText("?? Roll result", lang)}: **${roll}**\n\n` +
            `${await translateText("?? Bet", lang)}: ${abbreviate(betArg, "prefix")} ${currency}\n` +
            `${await translateText("Result", lang)}: **${win ? "+" : "-"}${abbreviate(Math.abs(gain), "prefix")} ${currency}**\n\n` +
            `${await translateText("New Balance", lang)}: **${abbreviate(userData.cash, "prefix")} ${currency}**`,
        );

        await new Promise((r) => setTimeout(r, 700));
        await interaction.editReply({ embeds: [result], components: [] });
        gameEnded = true;
        collector.stop();
      });

      collector.on("end", async () => {
        if (!gameEnded) {
          const e = await getUserEmbed(userId, "Dice Ended");
          e.setDescription(
            `${await translateText("Time ran out, refunded", lang)}: **${abbreviate(betArg, "prefix")} ${currency}**`,
          );
          userData.cash += betArg;
          save(ecoPath, data);
          await interaction
            .editReply({ embeds: [e], components: [] })
            .catch(() => {});
        }
      });
    }
  },
};














