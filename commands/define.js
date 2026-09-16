// define.js
const { SlashCommandBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('define')
    .setDescription('Look up a word and get clear definitions, examples, and synonyms')
    .addStringOption(opt =>
      opt.setName('word')
        .setDescription('Word to define (English)')
        .setRequired(true)
    ),
  category: 'Misc',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const rawWord = interaction.options.getString('word');
    const word = String(rawWord || '').trim();

    if (!word) {
      const e = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(await translateText('Please provide a word to define.', lang));
      return interaction.editReply({ embeds: [e] });
    }

    const apiUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;

    try {
      const res = await fetch(apiUrl);
      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0 || data.title === 'No Definitions Found') {
        const e = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(await translateText('No definition found. Check the spelling or try a different word.', lang));
        return interaction.editReply({ embeds: [e] });
      }

      // Prefer the entry that best matches the requested word (case-insensitive)
      const entry = pickBestEntry(data, word);

      const phoneticText = pickPhoneticText(entry);
      const audioUrl = pickAudioUrl(entry);
      const meaningBlocks = await buildMeaningBlocks(entry, lang);

      if (meaningBlocks.length === 0) {
        const e = (await getUserEmbed(interaction.user.id, null, 'error'))
          .setDescription(await translateText('No usable definitions were found for that word.', lang));
        return interaction.editReply({ embeds: [e] });
      }

      const title = `📖 ${capitalize(entry.word)}${phoneticText ? ` · ${phoneticText}` : ''}`;
      const embed = (await getUserEmbed(interaction.user.id, 'Define'))
        .setTitle(title)
        .setDescription(await translateText('Clear definitions, examples, and synonyms.', lang));

      // Add up to 3 parts of speech (Discord field limit safety)
      for (let i = 0; i < Math.min(3, meaningBlocks.length); i++) {
        const block = meaningBlocks[i];
        embed.addFields({
          name: `**${block.part}**`,
          value: truncate(block.text, 1024),
        });
      }

      // If we have an audio pronunciation, add it as a small note
      if (audioUrl) {
        embed.addFields({
          name: await translateText('Pronunciation audio', lang),
          value: `[${await translateText('Click to listen', lang)}](${audioUrl})`,
        });
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('DEFINE ERROR:', err);
      const e = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(await translateText('Could not fetch the definition. Please try again later.', lang));
      return interaction.editReply({ embeds: [e] });
    }
  }
};

/* -------------------------- helpers -------------------------- */

function pickBestEntry(entries, word) {
  const w = word.toLowerCase();
  // exact match first
  const exact = entries.find(e => (e.word || '').toLowerCase() === w);
  if (exact) return exact;
  // else the first one with meanings
  const withMeanings = entries.find(e => Array.isArray(e.meanings) && e.meanings.length > 0);
  return withMeanings || entries[0];
}

function pickPhoneticText(entry) {
  // choose a non-empty phonetic text if available
  if (Array.isArray(entry.phonetics)) {
    const withText = entry.phonetics.find(p => p.text && typeof p.text === 'string');
    if (withText) return withText.text.trim();
  }
  return entry.phonetic || '';
}

function pickAudioUrl(entry) {
  if (!Array.isArray(entry.phonetics)) return null;
  // prefer https audio with content
  const withAudio = entry.phonetics.find(p => p.audio && /^https?:\/\//i.test(p.audio));
  return withAudio ? withAudio.audio : null;
}

async function buildMeaningBlocks(entry, lang) {
  if (!Array.isArray(entry.meanings)) return [];

  // group by part of speech; within each, take up to 3 definitions with examples + synonyms line
  const blocks = await Promise.all(entry.meanings.map(async m => {
    const part = m.partOfSpeech ? capitalize(m.partOfSpeech) : 'Meaning';
    const defs = Array.isArray(m.definitions) ? m.definitions : [];

    // build definition bullets
    const bullets = [];
    for (let i = 0; i < Math.min(3, defs.length); i++) {
      const d = defs[i];
      if (!d || !d.definition) continue;

      let line = `• ${clean(d.definition)}`;
      if (d.example) line += `\n*“${clean(d.example)}”*`;
      bullets.push(line);
    }

    // synonyms (top 6 unique)
    const syns = collectSynonyms(m, defs);
    if (syns.length) {
      const SynonymsText = (await translateText("Synonyms", lang));
      bullets.push(`**${SynonymsText}:** ${syns.slice(0, 6).join(', ')}`);
    }

    const text = bullets.length ? bullets.join('\n\n') : '—';
    return { part, text };
  }));

  return blocks.filter(b => b.text && b.text !== '—');
}

function collectSynonyms(meaning, defs) {
  const set = new Set();
  if (Array.isArray(meaning.synonyms)) {
    meaning.synonyms.forEach(s => s && set.add(clean(s)));
  }
  defs.forEach(d => {
    if (Array.isArray(d.synonyms)) d.synonyms.forEach(s => s && set.add(clean(s)));
  });
  return [...set];
}

function clean(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

function truncate(s, max) {
  const str = String(s);
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function capitalize(str) {
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}
