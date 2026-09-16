const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const path = require('path');
const fs = require('fs');
const config = require('../config.json');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to load ${filePath}:`, err);
    return {};
  }
}

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Summarize Message')
    .setType(ApplicationCommandType.Message),

  category: 'Plus',

  async execute(interaction) {
    try {
      const msg = interaction.targetMessage;
      const userId = interaction.user.id;
      const lang = getUserLanguage(userId) || 'en';

      const tooShortText = await translateText(
        'Message too short to summarize (needs ≥ 250 characters).',
        lang
      );
      const noSentencesText = await translateText(
        'No valid sentences found to summarize.',
        lang
      );
      const aiFailText = await translateText(
        'AI summarization failed, using fallback method.',
        lang
      );
      const errorText = await translateText(
        'Something went wrong while summarizing this message.',
        lang
      );
      const titleText = await translateText('Summary', lang);
      const fallbackNoteText = await translateText(
        '(Generated using fallback summarizer.)',
        lang
      );

      if (!msg?.content || msg.content.length < 250) {
        const errEmbed = await getUserEmbed(userId, null, 'error');
        errEmbed.setDescription(tooShortText);
        return interaction.editReply({ embeds: [errEmbed] });
      }

      // optional plus check if you ever want it
      // const plusUsers = loadJSON(path.join(__dirname, '../data/plusUsers.json'));
      // if (!plusUsers[userId]) { ... }

      const rawText = msg.content.replace(/\s+/g, ' ').trim();

      let summary = null;
      let usedFallback = false;

      // --- Try Groq AI summarization first ---
      try {
        summary = await summarizeWithGroq(rawText, lang);
      } catch (err) {
        console.error('Groq summarization error:', err);
      }

      // --- Fallback: your local frequency-based summarizer ---
      if (!summary) {
        usedFallback = true;

        const sentences = rawText.match(/[^.!?]+[.!?]/g) || [rawText];
        if (sentences.length === 0) {
          const e = await getUserEmbed(userId, null, 'error');
          e.setDescription(noSentencesText);
          return interaction.editReply({ embeds: [e] });
        }

        // word frequency map
        const wordFreq = {};
        const words = rawText.split(/\s+/);
        for (const w of words) {
          const clean = w.toLowerCase().replace(/[^a-z0-9]/gi, '');
          if (!clean) continue;
          wordFreq[clean] = (wordFreq[clean] || 0) + 1;
        }

        const scored = sentences.map((s) => {
          const sWords = s.split(/\s+/);
          let score = 0;
          for (const w of sWords) {
            const clean = w.toLowerCase().replace(/[^a-z0-9]/gi, '');
            if (wordFreq[clean]) score += wordFreq[clean];
          }
          const lenBonus = sWords.length <= 20 ? 1.3 : sWords.length <= 35 ? 1.0 : 0.7;
          return { sentence: s.trim(), score: score * lenBonus };
        });

        scored.sort((a, b) => b.score - a.score);

        const keepCount =
          scored.length <= 3
            ? scored.length
            : scored.length <= 10
            ? 2
            : 3 + Math.floor(scored.length / 20);

        const selected = scored.slice(0, keepCount).map((s) => s.sentence);

        const ordered = sentences.filter((s) => selected.includes(s.trim()));
        summary = ordered.join(' ').replace(/\s+/g, ' ').trim();
      }

      const embed = await getUserEmbed(userId, 'Summary');
      let finalDesc = summary && summary.length > 0 ? summary : '(no summary generated)';

      if (usedFallback) {
        // Füge kleinen Hinweis hinzu, aber kurz halten
        finalDesc = `${finalDesc}\n\n*${fallbackNoteText}*`;
      }

      embed.setTitle(titleText);
      embed.setDescription(finalDesc);

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Summarize command error:', err);
      const e = await getUserEmbed(interaction.user.id, null, 'error');
      e.setDescription('⚠️ ' + (await translateText('Something went wrong while summarizing this message.', getUserLanguage(interaction.user.id) || 'en')));
      return interaction.editReply({ embeds: [e] });
    }
  }
};

// ---------- Groq AI summarizer ----------

async function summarizeWithGroq(text, userLang) {
  const apiKey = config.Groq_API_Key;
  if (!apiKey) return null;

  // cap length to avoid hitting model limits
  const maxChars = 8000;
  const snippet = text.length > maxChars ? text.slice(0, maxChars) : text;

  const systemPrompt0 =
    'You are a professional summarizer. You create clear, concise summaries that keep the most important information.';
  const userPrompt0 =
    `Summarize the following Discord message content in ${userLang}. ` +
    'The summary should be roughly about one third of the original length, but still easy to read. ' +
    'Focus on the main ideas, remove repetition, and keep the tone neutral.\n\n' +
    'Text:\n' +
    snippet;

    const systemPrompt =
      "You are a professional summarizer. You create clear, concise summaries that keep only the most important information and maintain high accuracy.";

    const userPrompt =
      `Summarize the following Discord message content in ${userLang}. 
    The summary should be about 25–35% of the original length, easy to read, and natural written.
    Focus on the key events, main characters, the central conflict, and its resolution. 
    Do not add new information, interpretations, or emotional embellishments.
    Remove repetition, filler sentences, and unnecessary details.

    Text:
    ${snippet}`;


  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 512
    })
  });

  if (!res.ok) {
    throw new Error('Groq API error: ' + res.status);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  return content || null;
}
