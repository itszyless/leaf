const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

function stripXml(value, tag) {
  const match = String(value || '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return '';
  return match[1].replace(/^<!\\[CDATA\\[/, '').replace(/\\]\\]>$/, '').trim();
}

async function steamProfile(input) {
  const clean = String(input || '').trim();
  const isId = /^\\d{15,20}$/.test(clean);
  const url = isId
    ? `https://steamcommunity.com/profiles/${clean}?xml=1`
    : `https://steamcommunity.com/id/${encodeURIComponent(clean)}?xml=1`;
  const res = await fetch(url);
  const xml = await res.text();
  if (!res.ok || /<error>/i.test(xml)) throw new Error(stripXml(xml, 'error') || 'Steam profile not found.');
  return { xml, url: stripXml(xml, 'profileURL') || url };
}

async function steamStoreSearch(query) {
  const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=en&cc=us`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(`HTTP ${res.status}`);
  return json.items?.[0] || null;
}

async function steamApp(appid) {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=en&cc=us`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.[appid]?.success) throw new Error('Steam app not found.');
  return json[appid].data;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('steam')
    .setDescription('Steam lookup commands')
    .addSubcommand(sub => sub.setName('user').setDescription('Look up a public Steam profile').addStringOption(opt => opt.setName('profile').setDescription('SteamID64 or vanity name').setRequired(true)))
    .addSubcommand(sub => sub.setName('game').setDescription('Search a Steam game').addStringOption(opt => opt.setName('name').setDescription('Game name').setRequired(true)))
    .addSubcommand(sub => sub.setName('app').setDescription('Look up a Steam app by AppID').addIntegerOption(opt => opt.setName('appid').setDescription('Steam AppID').setRequired(true))),
  category: 'Utility',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const embed = await getUserEmbed(interaction.user.id, 'Steam');

    try {
      if (sub === 'user') {
        const profile = await steamProfile(interaction.options.getString('profile'));
        const xml = profile.xml;
        embed.setTitle(stripXml(xml, 'steamID') || 'Steam Profile')
          .setURL(profile.url)
          .setDescription(stripXml(xml, 'summary') || 'No public summary.')
          .addFields(
            { name: 'SteamID64', value: `\`${stripXml(xml, 'steamID64') || 'Unknown'}\``, inline: true },
            { name: 'Status', value: stripXml(xml, 'onlineState') || 'Unknown', inline: true },
            { name: 'Privacy', value: stripXml(xml, 'privacyState') || 'Unknown', inline: true },
          );
        const avatar = stripXml(xml, 'avatarFull') || stripXml(xml, 'avatarMedium');
        if (avatar) embed.setThumbnail(avatar);
        return interaction.editReply({ embeds: [embed] });
      }

      const appid = sub === 'app'
        ? interaction.options.getInteger('appid')
        : (await steamStoreSearch(interaction.options.getString('name')))?.id;
      if (!appid) throw new Error('Steam game not found.');
      const app = await steamApp(appid);
      embed.setTitle(app.name || `Steam App ${appid}`)
        .setURL(`https://store.steampowered.com/app/${appid}`)
        .setDescription(String(app.short_description || 'No description.').slice(0, 1000))
        .addFields(
          { name: 'AppID', value: `\`${appid}\``, inline: true },
          { name: 'Price', value: app.is_free ? 'Free' : (app.price_overview?.final_formatted || 'Unknown'), inline: true },
          { name: 'Release', value: app.release_date?.date || 'Unknown', inline: true },
        );
      if (app.header_image) embed.setImage(app.header_image);
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      embed.setTitle('Steam Lookup Failed').setDescription(String(error.message || error).slice(0, 500));
      return interaction.editReply({ embeds: [embed] });
    }
  },
};

