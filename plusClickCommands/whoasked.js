const {
    ContextMenuCommandBuilder,
    ApplicationCommandType
  } = require('discord.js');
  const { getUserLanguage } = require('../utils/langStorage');
  const { getUserEmbed } = require('../utils/getUserEmbed');
  const { translateText } = require('../utils/translator');
  const path = require('path');
const fs = require('fs');
  
  const gifs = [
    'https://c.tenor.com/0ZTZAYDpLfIAAAAd/me-looking-for-who-asked-looking-for-who-asked.gif',
    'https://media.tenor.com/oTR1mjjYHDoAAAAM/who-asked-me-trying-to-find-who-asked.gif',
    'https://media.tenor.com/-TMvnXZabCQAAAAM/niko-who-tf-asked.gif',
    'https://media.tenor.com/yUw2NKPVCyEAAAAM/who-asked-me-trying-to-find-who-asked.gif',
    'https://media.tenor.com/2Gsf2UQ7Qw4AAAAM/who-asked.gif',
    'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExa3l2OXIzaHdrYnY3dm5samM4amQ2aGFzbmt0eGdmYWZoN3Y4eDFrdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/dzM3nSEoj9FlLzMALs/giphy.gif',
    'https://i.pinimg.com/originals/43/2e/96/432e964378bd538cd13d91f129638293.gif',
    'https://media.tenor.com/hCsVDyK7jNkAAAAM/anvil-anvil-empires.gif',
    'https://images.genius.com/b0cb1f66730c9da0649f6d2c65f03022.498x378x15.gif',
    'https://media.tenor.com/1qhMQC_hJQYAAAAM/fun-fact-yeah-me-too.gif',
    'https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyeDIweGxkc3prcGszeXE2MDZ3eGE3YmNsdmU2eWhjbXpyZ21kZThicyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/913tKh03su8T36dwbs/200w.gif'
  ];
  
  module.exports = {
    data: new ContextMenuCommandBuilder()
      .setName('Who Asked?')
      .setType(ApplicationCommandType.Message),
    category: 'Plus',
  
    async execute(interaction) {
      const msg = interaction.targetMessage;
      const lang = getUserLanguage(interaction.user.id) || 'en';
  
      if (!msg || !msg.content || msg.content.length > 200) {
        const errorText = await translateText('The selected message must be between 1 and 200 characters.', lang);
        const errorEmbed = await getUserEmbed(interaction.user.id, null, 'error');
        errorEmbed.setDescription(errorText);
        return await interaction.editReply({ embeds: [errorEmbed] });
      }
  
      const gif = gifs[Math.floor(Math.random() * gifs.length)];
      const textLabel = await translateText("User's written text:", lang);
      const finalLine = await translateText("But the question is... **who asked**?", lang);
  
      const embed = await getUserEmbed(interaction.user.id, 'Who-Asked?');
      embed.setDescription(`**${textLabel}**\n \`\`\`${msg.content}\`\`\`\n\n${finalLine}`);
      embed.setImage(gif);
  
      await interaction.editReply({ embeds: [embed] });
    }
  };
  