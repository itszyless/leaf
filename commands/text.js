const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const figlet = require('figlet');
const { getUserEmbed } = require('../utils/getUserEmbed');

const tinyMap = {
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ᶦ', j: 'ʲ',
  k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', q: 'ᑫ', r: 'ʳ', s: 'ˢ', t: 'ᵗ',
  u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', C: 'ᶜ', D: 'ᴰ', E: 'ᴱ', F: 'ᶠ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ',
  K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ', O: 'ᴼ', P: 'ᴾ', Q: 'Q', R: 'ᴿ', S: 'ˢ', T: 'ᵀ',
  U: 'ᵁ', V: 'ⱽ', W: 'ᵂ', X: 'ˣ', Y: 'ʸ', Z: 'ᶻ',
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
};

function toTiny(text) {
  return Array.from(text).map(ch => tinyMap[ch] || ch).join('');
}

function emojify(text) {
  return Array.from(text.toLowerCase()).map(ch => {
    if (ch >= 'a' && ch <= 'z') return `:regional_indicator_${ch}:`;
    if (ch === ' ') return '   ';
    if (ch === '!') return '❗';
    if (ch === '?') return '❓';
    if (ch >= '0' && ch <= '9') return `${ch}️⃣`;
    return ch;
  }).join(' ');
}

function uwuify(text) {
  return text
    .replace(/[lr]/g, 'w')
    .replace(/[LR]/g, 'W')
    .replace(/n([aeiou])/gi, 'ny$1')
    .replace(/ove/gi, 'uv')
    .replace(/!+/g, ' owo!')
    .replace(/\bthe\b/gi, 'da')
    .replace(/\bis\b/gi, 'ish')
    .replace(/\bhas\b/gi, 'haz') + ' ✨';
}

function trimOutput(text) {
  return text.length > 1900 ? `${text.slice(0, 1897)}...` : text;
}

function textOption(sub) {
  return sub.addStringOption(opt => opt.setName('text').setDescription('Text to convert').setRequired(true).setMaxLength(200));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('text')
    .setDescription('Text style tools')
    .addSubcommand(sub => textOption(sub.setName('tinytext').setDescription('Convert text into tiny letters')))
    .addSubcommand(sub => textOption(sub.setName('emojify').setDescription('Convert letters into emoji letters')))
    .addSubcommand(sub => textOption(sub.setName('uwuify').setDescription('Transform text into uwu-speak')))
    .addSubcommand(sub => textOption(sub.setName('clap').setDescription('Add claps between words')))
    .addSubcommand(sub => textOption(sub.setName('reverse').setDescription('Reverse text')))
    .addSubcommand(sub => sub.setName('ascii').setDescription('Generate ASCII art from text').addStringOption(opt => opt.setName('text').setDescription('Text to convert').setRequired(true).setMaxLength(20))),
  category: 'Fun',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const input = interaction.options.getString('text');

    if (sub === 'ascii') {
      try {
        const ascii = figlet.textSync(input, { font: 'Standard', width: 80, whitespaceBreak: true });
        const preview = ascii.length > 1950 ? ascii.slice(0, 1950) + '\n...' : ascii;
        const attachment = new AttachmentBuilder(Buffer.from(ascii, 'utf-8'), { name: 'ascii.txt' });
        const embed = await getUserEmbed(interaction.user.id, 'Ascii');
        embed.setTitle('🎨 ASCII Art').setDescription('```' + preview + '```');
        return interaction.editReply({ embeds: [embed], files: [attachment] });
      } catch {
        const embed = await getUserEmbed(interaction.user.id, null, 'error');
        embed.setDescription('Could not generate ASCII art.');
        return interaction.editReply({ embeds: [embed] });
      }
    }

    const output = {
      tinytext: toTiny,
      emojify,
      uwuify,
      clap: value => value.trim().split(/\s+/).join(' 👏 '),
      reverse: value => Array.from(value).reverse().join(''),
    }[sub](input);

    const titles = { tinytext: 'Tiny Text', emojify: 'Emojify', uwuify: 'Uwuify', clap: 'Clap', reverse: 'Reverse' };
    const embed = await getUserEmbed(interaction.user.id, titles[sub]);
    embed.setDescription(trimOutput(output));
    return interaction.editReply({ embeds: [embed] });
  }
};
