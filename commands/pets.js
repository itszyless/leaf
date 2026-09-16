const https = require('https');
const { SlashCommandBuilder } = require('discord.js');
const { getUserEmbed } = require('../utils/getUserEmbed');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
async function request(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  return fetch(url, { agent: httpsAgent, headers: { 'User-Agent': 'leaf Discord Bot', ...(options.headers || {}) }, ...options });
}

const PETS = {
  cat: {
    title: 'Random Cat',
    emoji: '🐱',
    url: 'https://api.thecatapi.com/v1/images/search',
    pick: data => data?.[0]?.url,
  },
  dog: {
    title: 'Random Dog',
    emoji: '🐶',
    url: 'https://dog.ceo/api/breeds/image/random',
    pick: data => data?.message,
  },
  fox: {
    title: 'Random Fox',
    emoji: '🦊',
    url: 'https://randomfox.ca/floof/',
    pick: data => data?.image,
  },
  duck: {
    title: 'Random Duck',
    emoji: '🦆',
    url: 'https://random-d.uk/api/v2/random',
    pick: data => data?.url,
  },
  panda: {
    title: 'Random Panda',
    emoji: '??',
    url: 'https://some-random-api.com/animal/panda',
    pick: data => data?.image,
  },
  bunny: {
    title: 'Random Bunny',
    emoji: '🐰',
    url: 'https://api.bunnies.io/v2/loop/random/?media=gif,png',
    pick: data => data?.media?.gif || data?.media?.poster || data?.media?.png,
  },
  bird: {
    title: 'Random Bird',
    emoji: '🐦',
    url: 'https://some-random-api.com/animal/bird',
    pick: data => data?.image,
  },
  koala: {
    title: 'Random Koala',
    emoji: '🐨',
    url: 'https://some-random-api.com/animal/koala',
    pick: data => data?.image,
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pets')
    .setDescription('Random pet and animal pictures')
    .addSubcommand(sub => sub.setName('cat').setDescription('Get a random cat'))
    .addSubcommand(sub => sub.setName('dog').setDescription('Get a random dog'))
    .addSubcommand(sub => sub.setName('fox').setDescription('Get a random fox'))
    .addSubcommand(sub => sub.setName('duck').setDescription('Get a random duck'))
    .addSubcommand(sub => sub.setName('panda').setDescription('Get a random panda'))
    .addSubcommand(sub => sub.setName('bunny').setDescription('Get a random bunny'))
    .addSubcommand(sub => sub.setName('bird').setDescription('Get a random bird'))
    .addSubcommand(sub => sub.setName('koala').setDescription('Get a random koala')),
  category: 'Image',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const pet = PETS[sub];
    const embed = await getUserEmbed(interaction.user.id, pet?.title || 'Pets');

    try {
      const res = await request(pet.url);
      const data = await res.json();
      const image = pet.pick(data);
      if (!res.ok || !image) throw new Error('No image returned.');
      embed.setTitle(`${pet.emoji} ${pet.title}`).setImage(image);
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      embed.setTitle('Pet API Failed').setDescription(error.message || 'Could not fetch a pet image.');
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
