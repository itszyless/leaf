const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
process.chdir(path.resolve(__dirname, '..'));
require('./setup').setup();
const directories = ['commands', 'helpCommands', 'clickCommands', 'plusCommands', 'plusClickCommands', 'events', 'handlers', 'utils', 'dashboard', 'scripts', 'tests'];
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const files = ['index.js', ...directories.filter(fs.existsSync).flatMap(walk)].filter(f => f.endsWith('.js'));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
}
const { Collection } = require('discord.js');
const bot = { commands: new Collection() };
const catalog = require('../handlers/registerCommands').loadCommands(bot);
const names = new Set();
for (const command of catalog) {
  const key = `${command.type || 1}:${command.name}`;
  if (names.has(key)) throw new Error(`Duplicate command: ${key}`);
  names.add(key);
}
for (const [type, limit] of [[1, 100], [2, 5], [3, 5]]) {
  const count = catalog.filter(c => (c.type || 1) === type).length;
  if (count > limit) throw new Error(`Discord command type ${type} has ${count} entries; limit ${limit}.`);
}
console.log(`Checked ${files.length} JavaScript files and ${catalog.length} command definitions.`);
process.exit(0);
