const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function setup() {
  const configFile = path.join(root, 'config.json');
  if (!fs.existsSync(configFile)) {
    const config = require('../config.example.json');
    config.Dashboard.SessionSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
    console.log('Created config.json. Add your Discord credentials to start the bot.');
  }
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  for (const [name, value] of Object.entries(require('../data/defaults.json'))) {
    const file = path.join(root, 'data', name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  }
  const agents = path.join(root, 'agents.json');
  if (!fs.existsSync(agents)) fs.writeFileSync(agents, '{}\n');
}
if (require.main === module) setup();
module.exports = { setup };
