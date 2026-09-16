const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { getUserLanguage } = require('./langStorage');
const { translateText } = require('./translator');

const layoutsPath = path.join(__dirname, '../data/embedLayouts.json');
const userLayoutsPath = path.join(__dirname, '../data/userLayouts.json');

async function getUserEmbed(userId, cmdName, errorBool) {
  const layouts = JSON.parse(fs.readFileSync(layoutsPath, 'utf8'));
  const userLayouts = JSON.parse(fs.readFileSync(userLayoutsPath, 'utf8'));
  const userLayoutId = userLayouts[userId];
  const userLayout = userLayoutId && layouts[userLayoutId] ? layouts[userLayoutId] : null;

  const userLang = getUserLanguage(userId) || 'en';

  const embed = new EmbedBuilder();

  if (userLayout) {
    if (errorBool) {
      embed.setColor(config.Embed_Error_Color);
    } else {
      if (userLayout.color) embed.setColor(userLayout.color);
    }


    if (userLayout.author) {
      if (userLayout.author.name && userLayout.author.icon_url) {
        if (cmdName) {
            const translatedTitle = await translateText(cmdName, userLang);
            embed.setAuthor({ name: `${userLayout.author.name} ${config['Arrow-Icon']} ${translatedTitle}`, iconURL: userLayout.author.icon_url });
        } else {
            embed.setAuthor({ name: `${userLayout.author.name}`, iconURL: userLayout.author.icon_url });
        }
      } else if (userLayout.author.name) {
        if (cmdName) {
            const translatedTitle = await translateText(cmdName, userLang);
            embed.setAuthor({ name: `${userLayout.author.name} ${config['Arrow-Icon']} ${translatedTitle}`});
        } else {
            embed.setAuthor({ name: `${userLayout.author.name}` });
        }
      }
    }

    if (userLayout.footer) {
      if (userLayout.footer.text && userLayout.footer.icon_url) {
        embed.setFooter({ text: userLayout.footer.text, iconURL: userLayout.footer.icon_url });
      } else if (userLayout.footer.text) {
        embed.setFooter({ text: userLayout.footer.text });
      }
    }

    if (userLayout.thumbnail) embed.setThumbnail(userLayout.thumbnail.url)
  } else {
      if (errorBool) {
        embed.setColor(config.Embed_Error_Color);
      } else {
        embed.setColor(config.Embed_Color)
      }
      embed.setFooter({ text: config.Embed_Footer, iconURL: config.Embed_Footer_Icon })
      embed.setThumbnail(config.Embed_Thumbnail_Icon)
      if (cmdName) {
        const translatedTitle = await translateText(cmdName, userLang);
        embed.setAuthor({ name: `${config.Embed_Author_Name} ${config['Arrow-Icon']} ${translatedTitle}`, iconURL: config.Embed_Author_Icon })
      } else {
        embed.setAuthor({ name: config.Embed_Author_Name, iconURL: config.Embed_Author_Icon })
      };
  }

  if (errorBool) {
    embed.setTitle((await translateText('❌ Error Occurred', userLang)))
  }

  embed.setTimestamp();

  return embed;
}

module.exports = { getUserEmbed };
