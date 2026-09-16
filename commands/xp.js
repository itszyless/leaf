const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');

const { getUserEmbed } = require('../utils/getUserEmbed');
const { abbreviate } = require('../utils/abbreviate');


const xpPath = path.join(__dirname, '../data/xp.json');

function getLevelFromXP(xp) {
  return Math.floor(0.2 * Math.sqrt(xp));
}

function getXPForLevel(level) {
  return Math.floor((level / 0.2) ** 2);
}

function saveXPData(data) {
  fs.writeFileSync(xpPath, JSON.stringify(data, null, 2));
}

function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}
  

module.exports = {
  data: new SlashCommandBuilder()
    .setName('xp')
    .setDescription('Manage XP for users')
    .addSubcommand(cmd =>
      cmd.setName('setxp').setDescription('Set XP of a user')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP').setRequired(true)))
    .addSubcommand(cmd =>
      cmd.setName('addxp').setDescription('Add XP to a user')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to add').setRequired(true)))
    .addSubcommand(cmd =>
      cmd.setName('removexp').setDescription('Remove XP from a user')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to remove').setRequired(true)))
    .addSubcommand(cmd =>
      cmd.setName('setlevel').setDescription('Set level of a user')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(opt => opt.setName('level').setDescription('Level to set').setRequired(true)))
    .addSubcommand(cmd =>
      cmd.setName('addlevel').setDescription('Add level to a user')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Levels to add').setRequired(true)))
    .addSubcommand(cmd =>
      cmd.setName('removelevel').setDescription('Remove level from a user')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Levels to remove').setRequired(true)))
    .addSubcommand(cmd =>
      cmd.setName('resetxp').setDescription('Reset XP and level of a user')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))),

  category: 'Admin',
  hidden: true,

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || 'en';
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');
    const userId = user.id;

    // Bot check
    if (user.bot) {
      const message = await translateText('Bots do not have any xp.', lang);

      const embed = (await getUserEmbed(interaction.user.id, null, 'error'))
        .setDescription(message)

      return interaction.editReply({ embeds: [embed] });
    }

    let data = {};
    if (fs.existsSync(xpPath)) {
      data = JSON.parse(fs.readFileSync(xpPath, 'utf8'));
    }
    if (!data[userId]) data[userId] = { xp: 0 };

    const xp = data[userId].xp || 0;
    const level = getLevelFromXP(xp);
    let newXP = xp;

    switch (sub) {
      case 'setxp':
        newXP = interaction.options.getInteger('amount');
        break;
      case 'addxp':
        newXP += interaction.options.getInteger('amount');
        break;
      case 'removexp':
        newXP = Math.max(0, xp - interaction.options.getInteger('amount'));
        break;
      case 'setlevel':
        newXP = getXPForLevel(interaction.options.getInteger('level'));
        break;
      case 'addlevel':
        newXP = getXPForLevel(level + interaction.options.getInteger('amount'));
        break;
      case 'removelevel':
        newXP = getXPForLevel(Math.max(0, level - interaction.options.getInteger('amount')));
        break;
      case 'resetxp':
        newXP = 0;
        break;
    }

    data[userId].xp = newXP;
    fs.writeFileSync(xpPath, JSON.stringify(data, null, 2));
    

    const successTitle = await translateText('XP Updated', lang);
    const successMessage = await translateText(`XP has been updated.`, lang);
    const newLevel = getLevelFromXP(newXP);
    const levelText = await translateText('New Level', lang);
    const xpText = await translateText('New XP', lang);

    const embed = (await getUserEmbed(interaction.user.id, 'XP'))
      .setTitle(successTitle)
      .setDescription(`<@${user.id}> ` + successMessage)
      .addFields(
        { name: levelText, value: abbreviate(newLevel, "prefix"), inline: true },
        { name: xpText, value: abbreviate(newXP, "prefix"), inline: true }
      )

    await interaction.editReply({ embeds: [embed] });
  }
};
