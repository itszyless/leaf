const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plus')
    .setDescription('Plus commands')
    .setDMPermission(true),
  category: 'Utils',
  hidden: true,

  async execute(interaction) {
    const userLang = getUserLanguage(interaction.user.id) || 'en';
    const commandsDir = path.join(__dirname, '..', 'plusCommands');
    const files = fs.readdirSync(commandsDir);

    const plusCommands = [];

    // --- Collect all plus commands
    for (const file of files) {
      const filePath = path.join(commandsDir, file);
      try {
        const command = require(filePath);
        if (command.category && command.category.toLowerCase() === 'plus') {
          const desc = await translateText(command.data.description, userLang);
          plusCommands.push({
            name: command.data.name,
            desc,
          });
        }
      } catch {
        continue;
      }
    }

    if (plusCommands.length === 0) {
      const errEmbed = (
        await getUserEmbed(interaction.user.id, null, 'error')
      ).setDescription(await translateText('❌ No commands available in this category.', userLang));

      return await interaction.ephemeralReply({ embeds: [errEmbed], ephemeral: true });
    }

    // --- Pagination setup
    const perPage = 10;
    const totalPages = Math.ceil(plusCommands.length / perPage);
    let currentPage = 1;

    const renderPage = async () => {
      const start = (currentPage - 1) * perPage;
      const slice = plusCommands.slice(start, start + perPage);
      const desc = slice
        .map(
          (cmd) =>
            `**/${cmd.name}** ${config['Arrow-Icon']} ${cmd.desc}`
        )
        .join('\n');

      const title = await translateText('Plus Commands', userLang);
      const pageText = `${await translateText('Page', userLang)} ${currentPage}/${totalPages}`;

      const embed = await getUserEmbed(interaction.user.id, 'Plus Commands');
      embed
        .setTitle(title)
        .setDescription(desc || '—')
        .setFooter({ text: pageText });

      const prevLabel = await translateText('Previous', userLang);
      const nextLabel = await translateText('Next', userLang);

      const prevBtn = new ButtonBuilder()
        .setCustomId('prev')
        .setLabel(prevLabel)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1);

      const nextBtn = new ButtonBuilder()
        .setCustomId('next')
        .setLabel(nextLabel)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages);

      const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

      return { embeds: [embed], components: [row] };
    };

    const msg = await interaction.ephemeralReply({
      ...(await renderPage()),
      ephemeral: true,
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000, // 2 minutes
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id)
        return i.reply({
          content: await translateText('This menu is not for you.', userLang),
          ephemeral: true,
        });

      if (i.customId === 'prev' && currentPage > 1) currentPage--;
      else if (i.customId === 'next' && currentPage < totalPages) currentPage++;

      await i.update(await renderPage());
    });

    collector.on('end', async () => {
      try {
        const final = await renderPage();
        final.components[0].components.forEach((b) => b.setDisabled(true));
        await msg.edit(final);
      } catch {
        // ignore timeout edits
      }
    });
  },
};

