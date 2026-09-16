const fs = require('fs');
const path = require('path');
const franc = require('franc-min').franc || require('franc-min');


const translate = require('google-translate-api-x');


const languagesDir = path.join(__dirname, '../languages');
if (!fs.existsSync(languagesDir)) fs.mkdirSync(languagesDir, { recursive: true });

function getLangFile(lang) {
  const file = path.join(languagesDir, `${lang}.json`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}');
  return file;
}
function loadLang(lang) {
  return JSON.parse(fs.readFileSync(getLangFile(lang), 'utf8'));
}
function saveLang(lang, data) {
  fs.writeFileSync(getLangFile(lang), JSON.stringify(data, null, 2));
}

/** Cached EN -> target translation */
async function translateText(text, targetLang = 'en') {
  if (!text || targetLang === 'en') return text;
  const data = loadLang(targetLang);
  if (data[text]) return data[text];

  try {
    const res = await translate(text, { to: targetLang });
    const translated = res.text;
    data[text] = translated;
    saveLang(targetLang, data);
    return translated;
  } catch (err) {
    console.error(`TranslateText failed [${targetLang}] "${text}": ${err.message}`);
    return text;
  }
}

/** Generic auto-detect translator (no caching) */
async function getTranslated(text, targetLang = 'en') {
  if (!text) return text;
  try {
    const res = await translate(text, { to: targetLang });
    return res.text;
  } catch (err) {
    console.error(`GetTranslated failed: ${err.message}`);
    return text;
  }
}

module.exports = { translateText, getTranslated };
