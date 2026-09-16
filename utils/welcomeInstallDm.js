const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../config.json');
const { isPlusActive } = require('./plusAccess');
const { markAuthorized, markDeauthorized } = require('./appAuthorizations');
function cmdMention(name) { return '</' + name + ':0>'; }
function dashboardUrl() { const dash = config.Dashboard || {}; return dash.PublicUrl || dash.BaseUrl || config.Website || 'http://localhost:3000'; }
function supportUrl() { return config.SupportServer || dashboardUrl(); }
function makeContainer(title, lines) {
  const c = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('## ' + title)).addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  for (const line of lines) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(line));
  return c;
}
async function sendInstallWelcome(bot, user) {
  if (!user?.id || user.bot) return;
  const firstTime = markAuthorized(user);
  if (!firstTime) return;
  const c = makeContainer('Welcome to leaf', ['Thanks for authorizing **leaf**. Use ' + cmdMention('help') + ' to explore commands, or open the dashboard to customize your settings.', '-# You can also use ' + cmdMention('plus buy') + ' if you want to unlock Plus features.']);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL(dashboardUrl()), new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL(supportUrl()));
  try { await user.send({ components: [c, row], flags: MessageFlags.IsComponentsV2 }); } catch {}
}
async function sendInstallGoodbye(bot, userId) {
  markDeauthorized(userId);
  if (!userId) return;
  let user = null;
  try { user = await bot.users.fetch(userId); } catch {}
  if (!user || user.bot) return;
  const lines = isPlusActive(userId) ? ['Sad to see you go. Your Plus status stays recorded while it is still active, so support can help if this was a mistake.'] : ['Sad to see you go. If something felt off, join support and mention this DM for a **10% discount on one month of leaf Plus**.'];
  lines.push('-# You can authorize leaf again anytime from the dashboard.');
  const c = makeContainer('Goodbye from leaf', lines);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL(supportUrl()), new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL(dashboardUrl()));
  try { await user.send({ components: [c, row], flags: MessageFlags.IsComponentsV2 }); } catch {}
}
module.exports = { sendInstallWelcome, sendInstallGoodbye };
