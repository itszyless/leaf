const { SlashCommandBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('yt-summary')
    .setDescription('Summarize a YouTube video from its transcript (Plus)')
    .addStringOption(opt =>
      opt
        .setName('url')
        .setDescription('YouTube video URL')
        .setRequired(true)
    ),

  category: 'Plus',

  async execute(interaction) {
    const userId = interaction.user.id;
    const lang = getUserLanguage(userId) || 'en';
    const urlInput = interaction.options.getString('url').trim();

    const titleText = await translateText('YouTube summary', lang);
    const fetchingText = await translateText('Fetching video information and transcript. Please wait.', lang);
    const invalidUrlText = await translateText('The provided URL is not a valid YouTube link or ID.', lang);
    const noTranscriptText = await translateText(
      'No transcript could be found for this video. This only works for videos with public subtitles.',
      lang
    );
    const errorText = await translateText('Failed to fetch video data. Please try again later.', lang);
    const summaryLabelText = await translateText('Summary', lang);
    const transcriptPreviewLabelText = await translateText('Transcript preview', lang);
    const aiUnavailableText = await translateText(
      'AI summary is currently unavailable. Showing transcript excerpt instead.',
      lang
    );

    const loadingEmbed = (await getUserEmbed(userId, 'YouTube'))
      .setTitle(titleText)
      .setDescription(fetchingText);

    await interaction.editReply({ embeds: [loadingEmbed] });

    try {
      const videoId = extractVideoId(urlInput);
      if (!videoId) {
        const errEmbed = (await getUserEmbed(userId, null, 'error'))
          .setDescription(invalidUrlText);
        return interaction.editReply({ embeds: [errEmbed] });
      }

      // Transcript holen (best effort, ohne API-Key)
      const transcript = await fetchTranscript(videoId, lang);
      if (!transcript) {
        const errEmbed = (await getUserEmbed(userId, null, 'error'))
          .setDescription(noTranscriptText);
        return interaction.editReply({ embeds: [errEmbed] });
      }

      // Video Info (Titel / Thumbnail) via oEmbed
      let videoInfo = null;
      try {
        videoInfo = await fetchOEmbedInfo(urlInput);
      } catch (e) {
        console.error('oEmbed failed:', e);
      }

      // AI Summary (Groq), wenn Key konfiguriert
      let summary = null;
      try {
        summary = await summarizeWithGroq(transcript, lang);
      } catch (e) {
        console.error('Groq summary failed:', e);
      }

      const trimmedTranscript = transcript.trim();
      const previewText =
        trimmedTranscript.length > 700
          ? trimmedTranscript.slice(0, 700) + '...'
          : trimmedTranscript || '-';

      let description = '';
      if (summary) {
        description =
          `**${summaryLabelText}:**\n${summary}\n\n` +
          `**${transcriptPreviewLabelText}:**\n${previewText}`;
      } else {
        description =
          `${aiUnavailableText}\n\n` +
          `**${transcriptPreviewLabelText}:**\n${previewText}`;
      }

      const embed = (await getUserEmbed(userId, 'YouTube'))
        .setTitle(videoInfo?.title || titleText)
        .setDescription(description)
        .setURL(urlInput);

      if (videoInfo?.thumbnail_url) {
        embed.setThumbnail(videoInfo.thumbnail_url);
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in /yt-summary:', err);
      const errEmbed = (await getUserEmbed(userId, null, 'error'))
        .setDescription(errorText);
      return interaction.editReply({ embeds: [errEmbed] });
    }
  },
};

// -------- Video ID aus URL ziehen --------
function extractVideoId(input) {
  try {
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

    const url = new URL(input);

    if (url.searchParams.has('v')) {
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }

    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const shortsIndex = parts.indexOf('shorts');
    const embedIndex = parts.indexOf('embed');
    if (shortsIndex !== -1 && parts[shortsIndex + 1]) {
      const id = parts[shortsIndex + 1];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (embedIndex !== -1 && parts[embedIndex + 1]) {
      const id = parts[embedIndex + 1];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    return null;
  } catch {
    return null;
  }
}

// -------- Transcript holen (JSON3 + XML, mehrere Sprachen, kein Key) --------
async function fetchTranscript(videoId, userLang) {
  const preferLang = (userLang || 'en').split('-')[0];

  const languagesToTry = [
    preferLang,
    preferLang === 'en' ? 'de' : 'en',
    'en',
    'en-US',
    'en-GB',
    'de',
  ].filter((v, i, arr) => !!v && arr.indexOf(v) === i);

  const baseUrls = [
    'https://www.youtube.com/api/timedtext',
    'https://video.google.com/timedtext',
  ];

  // 1) JSON3 Auto-Captions (kind=asr)
  for (const base of baseUrls) {
    for (const lang of languagesToTry) {
      try {
        const jsonUrl =
          `${base}?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}&fmt=json3&kind=asr`;

        const jsonRes = await fetch(jsonUrl);
        if (jsonRes.ok) {
          const json = await jsonRes.json().catch(() => null);
          if (json && Array.isArray(json.events) && json.events.length > 0) {
            const parts = [];
            for (const ev of json.events) {
              if (!ev.segs) continue;
              for (const seg of ev.segs) {
                if (typeof seg.utf8 === 'string') {
                  parts.push(seg.utf8.replace(/\s+/g, ' ').trim());
                }
              }
            }
            const text = parts.join(' ').trim();
            if (text.length > 0) return text;
          }
        }
      } catch (err) {
        console.error(`JSON3 transcript failed (${base}, ${lang}):`, err);
      }
    }
  }

  // 2) XML Captions
  for (const base of baseUrls) {
    for (const lang of languagesToTry) {
      try {
        const xmlUrl =
          `${base}?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}`;

        const xmlRes = await fetch(xmlUrl);
        if (!xmlRes.ok) continue;

        const xml = await xmlRes.text();
        if (!xml || !xml.includes('<text')) continue;

        const matches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
        if (!matches.length) continue;

        const parts = matches
          .map(m => decodeHtml(m[1].replace(/\s+/g, ' ').trim()))
          .filter(Boolean);

        const text = parts.join(' ').trim();
        if (text.length > 0) return text;
      } catch (err) {
        console.error(`XML transcript failed (${base}, ${lang}):`, err);
      }
    }
  }

  return null;
}

// -------- YouTube oEmbed (Titel / Thumbnail) --------
async function fetchOEmbedInfo(videoUrl) {
  const endpoint = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(videoUrl);
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error('oEmbed failed');
  return res.json();
}

// -------- AI-Summary via Groq (wenn Key vorhanden) --------
async function summarizeWithGroq(transcript, userLang) {
  const apiKey = config.Groq_API_Key;
  if (!apiKey) return null;

  const maxChars = 12000;
  const snippet = transcript.length > maxChars ? transcript.slice(0, maxChars) : transcript;

  const systemPrompt = 'You summarize YouTube video transcripts clearly and concisely.';
  const userPrompt =
    `Summarize the following YouTube video transcript in ${userLang}. ` +
    'First give a short TL;DR line, then 3 to 5 bullet points with the most important key ideas.\n\n' +
    'Transcript:\n' +
    snippet;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    throw new Error('Groq API error: ' + res.status);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || null;
}

// -------- HTML-Entities aus XML decoden --------
function decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}
