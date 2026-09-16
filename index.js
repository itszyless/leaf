const path = require('node:path');
process.chdir(__dirname);
require('./scripts/setup').setup();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const config = require('./config.json');
const { loadCommands, registerCommands } = require('./handlers/registerCommands');
const { loadEvents } = require('./handlers/eventHandler');
const { startDashboard } = require('./dashboard/server');
const webOnly = process.argv.includes('--web-only');
const botOnly = process.argv.includes('--bot-only');
const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
bot.commands = new Collection();
bot.snipes = new Map();
global.client = bot;
let server;
let stocksTimer;
async function main() {
  loadCommands(bot);
  if (!webOnly && !config.Token) throw new Error('Add Token to config.json, or use npm run web for the website preview.');
  if (!botOnly) server = startDashboard(bot);
  if (webOnly) {
    console.log('Website-only mode: Discord is offline; live bot features require npm start.');
    return;
  }
  loadEvents(bot);
  bot.once(Events.ClientReady, async () => {
    try {
      console.log(`${bot.user.username} ${require('./package.json').version} connected to Discord`);
      await registerCommands(bot);
      for (const name of ['reminder', 'giveaway']) {
        const command = require(path.join(__dirname, 'commands', name));
        if (typeof command.init === 'function') command.init(bot);
      }
      require('./utils/lotteryRunner').runLottery(bot);
      stocksTimer = setInterval(() => {
        Promise.resolve(require('./commands/eco').updateStocksIfNeeded()).catch(console.error);
      }, 60_000);
    } catch (error) { fail(error); }
  });
  await bot.login(config.Token);
}
function stop(code = 0) {
  clearInterval(stocksTimer);
  bot.destroy();
  if (server) server.close();
  process.exit(code);
}
function fail(error) {
  console.error(`Startup failed (${error.code || error.name || 'Error'}): ${String(error.message || 'Unknown error').replaceAll(config.Token || '\0', '[redacted]')}`);
  stop(1);
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
main().catch(fail);
