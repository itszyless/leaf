const { SlashCommandBuilder } = require('discord.js');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText, getTranslated } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');
const fallbackRoasts = [
  "You're proof that even loading screens can have opinions.",
  "You bring everyone so much joy when you leave the voice channel.",
  "I'd agree with you, but then we'd both be wrong.",
  "You're not useless. You can always be used as a bad example.",
  "Your secrets are safe with me. I never even listen when you tell me them.",
  "You have something on your chin. No, the third one down.",
  "You're like a software update: somehow necessary, but nobody is excited.",
  "If common sense were currency, you'd still be asking for a loan.",
  "You're the reason group projects need a report button.",
  "You have the confidence of someone who has never read the error message.",
  "You're not the sharpest tool in the shed, but at least you're stored indoors.",
  "Your brain has great battery life because it is always on low power mode.",
  "You are living proof that Ctrl+Z should work on conversations.",
  "You're like a typo in production: small, loud, and somehow everyone noticed.",
  "You make lag look responsive.",
  "You're the human version of a missing semicolon.",
  "I'd roast you harder, but your Wi-Fi already did enough damage.",
  "You have the aura of an unread terms and conditions checkbox.",
  "You're what happens when the tutorial is skipped and never revisited.",
  "Even your shadow leaves early when the conversation gets difficult."
];

let lastInsult = null;

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}


function pickRoast() {
  const roasts = fallbackRoasts;
  const pool = roasts.length > 1 ? roasts.filter((roast) => roast !== lastInsult) : roasts;
  const insult = pool[Math.floor(Math.random() * pool.length)] || 'You suck.';
  lastInsult = insult;
  return decodeHtmlEntities(insult);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Get roasted by the bot')
    .addUserOption(opt => opt.setName('user').setDescription('User to roast').setRequired(false)),
  hidden: true,
  category: 'Fun',

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const target = interaction.options.getUser('user');
    const insult = pickRoast();

    const title = await translateText('Roast Time', lang);
    const translated = await getTranslated(insult, lang);

    const embed = (await getUserEmbed(interaction.user.id, 'Roast'))
      .setTitle(`🔥 ${title}`)
      .setDescription(`${target ? `${target} ` : ""}**${translated}**`);

    interaction.editReply({ embeds: [embed] });
  }
};

