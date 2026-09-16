const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');
const config = require('../config.json');

async function createPaste(text, title) {
  if (config.Paste_API_Key && config.Paste_API_Key !== 'REPLACE_KEY_HERE') {
    const body = new URLSearchParams({
      api_dev_key: config.Paste_API_Key,
      api_option: 'paste',
      api_paste_code: text,
      api_paste_name: title,
      api_paste_expire_date: 'N',
    });
    const res = await fetch('https://pastebin.com/api/api_post.php', { method: 'POST', body });
    const out = (await res.text()).trim();
    if (res.ok && /^https?:\/\//.test(out)) return out;
  }

  const body = new URLSearchParams({ text, title });
  const res = await fetch('https://rentry.co/api/new', {
    method: 'POST',
    headers: { 'User-Agent': 'leaf bot' },
    body,
  });
  const out = await res.json().catch(() => null);
  if (out?.url) return out.url;
  throw new Error('Paste service failed');
}

module.exports = {
  category: 'Utility',
  data: new SlashCommandBuilder()
    .setName('paste')
    .setDescription('Create a paste link')
    .addStringOption(o => o.setName('text').setDescription('Paste text').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Paste title')),
  async execute(interaction) {
    const text = interaction.options.getString('text', true);
    const title = interaction.options.getString('title') || 'leaf Paste';
    const e = await getUserEmbed(interaction.user.id, 'Paste');
    try {
      const url = await createPaste(text, title);
      e.setDescription('Created paste: ' + url);
    } catch {
      e.setTitle('Paste Failed').setDescription('Could not create a paste link right now.');
    }
    return interaction.editReply({ embeds: [e] });
  },
};
