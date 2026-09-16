const fs = require('fs');
const path = require('path');
const langFile = path.join(__dirname, '..', 'data/userLanguages.json');

function getUserLanguage(userId) {
  if (!fs.existsSync(langFile)) return 'en';
  const data = JSON.parse(fs.readFileSync(langFile, 'utf8'));
  return data[userId] || 'en';
}

function setUserLanguage(userId, lang) {
  let data = {};
  if (fs.existsSync(langFile)) {
    data = JSON.parse(fs.readFileSync(langFile, 'utf8'));
  }
  data[userId] = lang;
  fs.writeFileSync(langFile, JSON.stringify(data, null, 2));
}

module.exports = { getUserLanguage, setUserLanguage };
