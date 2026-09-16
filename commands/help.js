const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const commandsList = [
  { name: 'ai', description: 'AI commands' },
  { name: 'animated', description: 'Animated messages' },
  { name: 'economy', description: 'Economy commands' },
  { name: 'fun', description: 'Funny commands' },
  { name: 'games', description: 'Games and interactive commands' },
  { name: 'image', description: 'Image commands' },
  { name: 'media', description: 'Media commands' },
  { name: 'misc', description: 'Miscellaneous' },
  { name: 'owner', description: 'Owner commands' },
  { name: 'personal', description: 'Personal commands' },
  { name: 'plus', description: 'Plus commands' },
  { name: 'rank', description: 'Rank commands' },
  { name: 'roblox', description: 'Roblox commands' },
  { name: 'settings', description: 'Settings' },
  { name: 'utility', description: 'Utility commands' }
];

const commandFolders = ['commands', 'plusCommands'];

function normalizeCategory(category) {
  const clean = String(category || 'Misc').trim().toLowerCase();
  if (clean === 'utils' || clean === 'util') return 'utility';
  if (clean === 'admin') return 'owner';
  return clean || 'misc';
}

function optionTypeName(type) {
  return type === 1 ? 'subcommand' : type === 2 ? 'group' : 'option';
}

function getCommandEntries(rootDir, selectedCategory = null) {
  const entries = [];

  for (const folder of commandFolders) {
    const dir = path.join(rootDir, folder);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const full = path.join(dir, file);
      delete require.cache[require.resolve(full)];
      const cmd = require(full);
      if (!cmd || cmd.hidden || !cmd.data || !cmd.data.name) continue;

      const category = normalizeCategory(cmd.category || (folder === 'plusCommands' ? 'Plus' : 'Misc'));
      if (selectedCategory && category !== selectedCategory) continue;

      const json = cmd.data.toJSON();
      const subcommands = [];
      for (const opt of json.options || []) {
        if (opt.type === 1) {
          subcommands.push({
            name: opt.name,
            description: opt.description || `${optionTypeName(opt.type)} command`
          });
        } else if (opt.type === 2) {
          const children = (opt.options || []).filter(child => child.type === 1);
          if (children.length === 0) {
            subcommands.push({
              name: opt.name,
              description: opt.description || `${optionTypeName(opt.type)} command`
            });
          }

          for (const child of children) {
            subcommands.push({
              name: `${opt.name} ${child.name}`,
              description: child.description || opt.description || 'Subcommand'
            });
          }
        }
      }

      entries.push({
        name: json.name,
        description: json.description || '',
        category,
        subcommands
      });
    }
  }

  return entries;
}

function actionCount(entry) {
  return entry.subcommands.length || 1;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show command categories or list commands from a category.')
    .addStringOption(opt =>
      opt
        .setName('category')
        .setDescription('Choose a command category to view all its commands.')
        .setRequired(false)
        .addChoices(
          ...commandsList.map(cmd => ({
            name: cmd.name.charAt(0).toUpperCase() + cmd.name.slice(1),
            value: cmd.name.toLowerCase()
          }))
        )
    ),
  category: 'Utility',

  async execute(interaction) {
    const userLang = (await getUserLanguage(interaction.user.id)) || 'en';
    const selectedCategory = interaction.options.getString('category');
    const embed = await getUserEmbed(interaction.user.id, 'Help');
    const rootDir = path.join(__dirname, '..');

    if (selectedCategory) {
      const categoryName = normalizeCategory(selectedCategory);
      const commands = getCommandEntries(rootDir, categoryName)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (commands.length === 0) {
        embed
          .setTitle(await translateText('No Commands Found', userLang))
          .setDescription(await translateText('No commands found in this category.', userLang));
        return interaction.editReply({ embeds: [embed] });
      }

      const lines = [];
      for (const command of commands) {
        if (command.subcommands.length > 0) {
          lines.push(`- **/${command.name}** ${config['Arrow-Icon']} ${command.description || 'Command group'}`);
          for (const sub of command.subcommands) {
            lines.push(`  - **/${command.name} ${sub.name}** ${config['Arrow-Icon']} ${sub.description}`);
          }
        } else {
          lines.push(`- **/${command.name}** ${config['Arrow-Icon']} ${command.description || 'No description'}`);
        }
      }

      const perPage = 12;
      const totalPages = Math.ceil(lines.length / perPage);
      let currentPage = 1;

      const renderPage = async () => {
        const start = (currentPage - 1) * perPage;
        const slice = lines.slice(start, start + perPage);
        const actionTotal = commands.reduce((sum, cmd) => sum + actionCount(cmd), 0);

        embed.setTitle(await translateText(
          `${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Commands (Page ${currentPage}/${totalPages})`,
          userLang
        ));
        embed.setDescription(`\`${commands.length}\` ${await translateText('slash commands', userLang)} | \`${actionTotal}\` ${await translateText('actions', userLang)}\n${slice.join('\n')}`);

        const prevBtn = new ButtonBuilder()
          .setCustomId('prevPage')
          .setLabel(await translateText('Previous', userLang))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 1);

        const nextBtn = new ButtonBuilder()
          .setCustomId('nextPage')
          .setLabel(await translateText('Next', userLang))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === totalPages);

        const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);
        return { embeds: [embed], components: totalPages > 1 ? [row] : [] };
      };

      const message = await interaction.editReply(await renderPage());
      if (totalPages <= 1) return;

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000
      });

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: 'This is not your help menu.', ephemeral: true }).catch(() => {});
        }

        if (i.customId === 'prevPage' && currentPage > 1) currentPage--;
        else if (i.customId === 'nextPage' && currentPage < totalPages) currentPage++;

        await i.update(await renderPage()).catch(() => {});
      });

      collector.on('end', async () => {
        const disabled = (await renderPage()).components;
        if (disabled[0]) {
          disabled[0].components.forEach(btn => btn.setDisabled(true));
          message.edit({ components: disabled }).catch(() => {});
        }
      });

      return;
    }

    const allCommands = getCommandEntries(rootDir);
    const categoryCounts = {};
    const actionCounts = {};

    for (const cmd of allCommands) {
      categoryCounts[cmd.category] = (categoryCounts[cmd.category] || 0) + 1;
      actionCounts[cmd.category] = (actionCounts[cmd.category] || 0) + actionCount(cmd);
    }

    const translatedTitle = await translateText('Help - List of Commands', userLang);
    let description = '';

    for (const cmd of commandsList) {
      const key = normalizeCategory(cmd.name);
      const count = categoryCounts[key] || 0;
      const actions = actionCounts[key] || 0;
      if (!count && !actions) continue;
      const translatedDesc = await translateText(cmd.description, userLang);
      description += `\`${count}\` commands / \`${actions}\` actions : **${key}** ${config['Arrow-Icon']} ${translatedDesc}\n`;
    }

    description += `\n${await translateText('Use', userLang)} **/help category** ${await translateText('to browse a category.', userLang)}`;
    embed.setTitle(translatedTitle).setDescription(description);
    await interaction.editReply({ embeds: [embed] });
  }
};




