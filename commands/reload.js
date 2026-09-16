const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

function loadCommands(dirPath, client, targetCollection, typeLabel) {
  const folder = path.join(__dirname, dirPath);
  if (!fs.existsSync(folder)) return 0;

  const files = fs.readdirSync(folder).filter(f => f.endsWith('.js'));
  let reloaded = 0;

  for (const file of files) {
    const fullPath = path.join(folder, file);
    delete require.cache[require.resolve(fullPath)];
    try {
      const cmd = require(fullPath);
      targetCollection.set(cmd.data.name, cmd);
      reloaded++;
    } catch (err) {
      console.error(`❌ Failed to reload ${typeLabel} command: ${file}`, err);
    }
  }

  return reloaded;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Reload all or specific commands (Owner only).')
    .addStringOption(opt =>
      opt
        .setName('command')
        .setDescription('Command name to reload (optional)')
        .setRequired(false)
    ),
  category: 'Admin',
  hidden: true,

  async execute(interaction) {
    try {
      const lang = (await getUserLanguage(interaction.user.id)) || 'en';
      const isOwner =
        interaction.user.id === config.Owner_ID;

      if (!isOwner) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription(await translateText('You are not authorized to use this command.', lang));
        return interaction.editReply({ embeds: [err] });
      }

      const cmdName = interaction.options.getString('command');
      const embed = await getUserEmbed(interaction.user.id, 'Reload');
      embed.setTitle(await translateText('🔁 Reload Commands', lang));

      // --- Single command reload
      if (cmdName) {
        const dirs = [
          '../commands',
          '../plusCommands',
          '../clickCommands',
          '../plusClickCommands'
        ];

        let found = false;
        for (const dir of dirs) {
          const filePath = path.join(__dirname, dir, `${cmdName}.js`);
          if (fs.existsSync(filePath)) {
            delete require.cache[require.resolve(filePath)];
            const cmd = require(filePath);
            interaction.client.commands.set(cmd.data.name, cmd);
            found = true;
            break;
          }
        }

        if (!found) {
          const err = await getUserEmbed(interaction.user.id, null, 'error');
          const p1 = await translateText('Command Not Found', lang);
          err.setDescription(
            p1
          );
          return interaction.editReply({ embeds: [err] });
        }

        embed.setDescription(
          await translateText(`Successfully reloaded command.`, lang)
        );
        return interaction.editReply({ embeds: [embed] });
      }

      // --- Reload ALL command types
      let freeCount = loadCommands('../commands', interaction.client, interaction.client.commands, 'free');
      let plusCount = loadCommands('../plusCommands', interaction.client, interaction.client.commands, 'plus');
      let clickCount = loadCommands('../clickCommands', interaction.client, interaction.client.commands, 'click');
      let plusClickCount = loadCommands('../plusClickCommands', interaction.client, interaction.client.commands, 'plus click');

      const total = freeCount + plusCount + clickCount + plusClickCount;

      embed.setDescription(
        [
          `✅ ${await translateText('Reload complete!', lang)}`,
          '',
          `**${await translateText('Free Commands', lang)}:** ${freeCount}`,
          `**${await translateText('Plus Commands', lang)}:** ${plusCount}`,
          `**${await translateText('Click Commands', lang)}:** ${clickCount}`,
          `**${await translateText('Plus Click Commands', lang)}:** ${plusClickCount}`,
          '',
          `**${await translateText('Total Reloaded', lang)}:** ${total}`
        ].join('\n')
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('❌ Error in /reload command:', err);
      try {
        const errorEmbed = await getUserEmbed(interaction.user.id, null, 'error');
        errorEmbed
          .setTitle('❌ Unexpected Error')
          .setDescription(`\`\`\`${err.message}\`\`\``);
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (nestedErr) {
        console.error('❌ Failed to send error embed:', nestedErr);
      }
    }
  }
};
