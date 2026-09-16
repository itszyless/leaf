const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

async function valorant(path) {
  const res = await fetch(`https://valorant-api.com/v1${path}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(`HTTP ${res.status}`);
  return json.data;
}

function findByName(list, query) {
  const q = String(query || '').toLowerCase();
  return list.find(item => item.displayName?.toLowerCase() === q)
    || list.find(item => item.displayName?.toLowerCase().includes(q));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('valorant')
    .setDescription('Valorant lookup commands')
    .addSubcommand(sub => sub.setName('agent').setDescription('Look up a Valorant agent').addStringOption(opt => opt.setName('name').setDescription('Agent name').setRequired(true)))
    .addSubcommand(sub => sub.setName('weapon').setDescription('Look up a Valorant weapon').addStringOption(opt => opt.setName('name').setDescription('Weapon name').setRequired(true)))
    .addSubcommand(sub => sub.setName('map').setDescription('Look up a Valorant map').addStringOption(opt => opt.setName('name').setDescription('Map name').setRequired(true)))
    .addSubcommand(sub => sub.setName('skin').setDescription('Look up a Valorant weapon skin').addStringOption(opt => opt.setName('name').setDescription('Skin name').setRequired(true)))
    .addSubcommand(sub => sub.setName('spray').setDescription('Look up a Valorant spray').addStringOption(opt => opt.setName('name').setDescription('Spray name').setRequired(true))),
  category: 'Games',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const name = interaction.options.getString('name');
    const embed = await getUserEmbed(interaction.user.id, 'Valorant');

    try {
      if (sub === 'agent') {
        const list = (await valorant('/agents?isPlayableCharacter=true')).filter(a => a.isPlayableCharacter);
        const agent = findByName(list, name);
        if (!agent) throw new Error('Agent not found.');
        embed.setTitle(agent.displayName).setDescription(agent.description || 'No description.');
        if (agent.displayIcon) embed.setThumbnail(agent.displayIcon);
        if (agent.fullPortrait) embed.setImage(agent.fullPortrait);
        if (agent.role?.displayName) embed.addFields({ name: 'Role', value: agent.role.displayName, inline: true });
        return interaction.editReply({ embeds: [embed] });
      }

      const endpoint = { weapon: '/weapons', map: '/maps', skin: '/weapons/skins', spray: '/sprays' }[sub];
      const item = findByName(await valorant(endpoint), name);
      if (!item) throw new Error(`${sub} not found.`);
      embed.setTitle(item.displayName).setDescription(item.description || item.tacticalDescription || 'No description.');
      const image = item.displayIcon || item.fullRender || item.splash || item.listViewIcon || item.largeArt;
      if (image) embed.setImage(image);
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      embed.setTitle('Valorant Lookup Failed').setDescription(String(error.message || error).slice(0, 500));
      return interaction.editReply({ embeds: [embed] });
    }
  },
};

