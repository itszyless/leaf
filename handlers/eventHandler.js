const fs = require('fs');
const path = require('path');

function loadEvents(bot) {
  const eventsDir = path.join(__dirname, '..', 'events');
  if (!fs.existsSync(eventsDir)) {
    console.warn('⚠ No /events folder found.');
    return;
  }

  const eventFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'));

  for (const file of eventFiles) {
    const full = path.join(eventsDir, file);
    const eventModule = require(full);

    // we support 2 styles:
    // style A: { name: 'eventName', once: bool, execute(bot, ...args) { ... } }
    // style B: function(bot) { bot.on('eventName', ...) }  <-- not using this here, but we could
    //
    // You're using style A in your original events folder and we'll keep that.

    if (!eventModule || !eventModule.name || typeof eventModule.execute !== 'function') {
      console.warn(`⚠ Skipping event file ${file} (missing name/execute)`);
      continue;
    }

    if (eventModule.once) {
      bot.once(eventModule.name, (...args) => eventModule.execute(bot, ...args));
    } else {
      bot.on(eventModule.name, (...args) => eventModule.execute(bot, ...args));
    }
  }

  console.log(`✅ Loaded ${eventFiles.length} events`);
}

module.exports = { loadEvents };
