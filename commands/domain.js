const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
async function request(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  return fetch(url, { agent: httpsAgent, ...options });
}
const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

const TYPES = ['A', 'AAAA', 'MX', 'NS', 'TXT'];

function cleanDomain(input) {
  return String(input || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
}

function answersToText(answer = []) {
  return answer
    .map(row => String(row.data || '').replace(/^"|"$/g, ''))
    .filter(Boolean)
    .slice(0, 6)
    .join('\n') || 'No records';
}

async function queryDns(domain, type, resolver) {
  if (resolver === 'cloudflare') {
    const res = await request(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
      headers: { Accept: 'application/dns-json' },
    });
    if (!res.ok) throw new Error(`Cloudflare DNS returned HTTP ${res.status}`);
    return res.json();
  }
  const res = await request(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`);
  if (!res.ok) throw new Error(`Google DNS returned HTTP ${res.status}`);
  return res.json();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('domain')
    .setDescription('Domain utilities')
    .addSubcommand(sub => sub
      .setName('lookup')
      .setDescription('Look up DNS records for a domain')
      .addStringOption(opt => opt.setName('domain').setDescription('Domain to look up').setRequired(true))
      .addStringOption(opt => opt
        .setName('resolver')
        .setDescription('DNS resolver')
        .setRequired(false)
        .addChoices(
          { name: 'Google DNS', value: 'google' },
          { name: 'Cloudflare DNS', value: 'cloudflare' },
        ))),
  category: 'Utility',

  async execute(interaction) {
    const domain = cleanDomain(interaction.options.getString('domain'));
    const resolver = interaction.options.getString('resolver') || 'google';
    const embed = await getUserEmbed(interaction.user.id, 'Domain Lookup');

    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      embed.setTitle('Invalid Domain').setDescription('Please enter a valid domain, like `example.com`.');
      return interaction.editReply({ embeds: [embed] });
    }

    try {
      const results = await Promise.all(TYPES.map(async type => [type, await queryDns(domain, type, resolver)]));
      embed
        .setTitle(`${domain} DNS Lookup`)
        .setDescription(`Resolver: **${resolver === 'cloudflare' ? 'Cloudflare DNS' : 'Google DNS'}**`);
      for (const [type, data] of results) {
        embed.addFields({ name: type, value: answersToText(data.Answer), inline: false });
      }
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      embed.setTitle('Lookup Failed').setDescription(error.message || 'Could not look up that domain.');
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
