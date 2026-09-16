const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('../config.json');

function prefixPlusDescriptions(option) {
  if (!option || typeof option !== 'object') return;
  if (typeof option.description === 'string' && !option.description.startsWith('\u2728 ')) {
    option.description = `\u2728 ${option.description}`;
  }
  for (const child of option.options || []) prefixPlusDescriptions(child);
}

/**
 * Loads all commands from the command folders,
 * attaches them to bot.commands,
 * and registers them with Discord.
 */
function loadCommands(bot) {
  const folders = [
    'commands',
    'helpCommands',
    'clickCommands',
    'plusClickCommands',
    'plusCommands'
  ];

  const commandsArray = [];

  for (const folder of folders) {
    const dirPath = path.join(__dirname, '..', folder);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));

    for (const file of files) {
      const full = path.join(dirPath, file);
      const command = require(full);

      // skip invalid command modules
      if (!command || command.hidden || !command.data || !command.data.name) continue;

      // save in bot.commands so we can run them later on interactionCreate
      bot.commands.set(command.data.name, command);

      // toJSON for registration
      const json = command.data.toJSON();
      if (command.category === 'Plus' || folder === 'plusCommands') {
        prefixPlusDescriptions(json);
      }

      // keep your original integration/context settings
      json.integration_types = [0, 1];
      json.contexts = [0, 1, 2];

      commandsArray.push(json);
    }
  }

  return commandsArray;
}

async function registerCommands(bot) {
  const commandsArray = loadCommands(bot);
  // Register the same validated catalog used by the dashboard.
  const rest = new REST({ version: '10' }).setToken(config.Token);
  await rest.put(
    Routes.applicationCommands(bot.user.id),
    { body: commandsArray }
  );

  console.log(`✅ Registered ${commandsArray.length} slash commands`);
}

module.exports = { loadCommands, registerCommands };

