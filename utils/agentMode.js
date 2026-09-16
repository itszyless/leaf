const fs = require('fs');
const path = require('path');

const agentsPath = path.join(__dirname, '../agents.json');

function getAgentSettings() {
  if (!fs.existsSync(agentsPath)) return {};
  return JSON.parse(fs.readFileSync(agentsPath, 'utf8'));
}

function saveAgentSettings(data) {
  fs.writeFileSync(agentsPath, JSON.stringify(data, null, 2));
}

function getAgentMode(userId) {
  const agents = getAgentSettings();
  return agents[userId] ?? true;
}

function setAgentMode(userId, enabled) {
  const agents = getAgentSettings();
  agents[userId] = enabled;
  saveAgentSettings(agents);
}

module.exports = {
  getAgentMode,
  setAgentMode
};
