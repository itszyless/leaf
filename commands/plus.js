const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const noblox = require('../utils/robloxUsers');
const config = require('../config.json');
const { getUserEmbed } = require('../utils/getUserEmbed');
const { grantPlus, isPlusActive, loadJson, saveJson } = require('../utils/plusAccess');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const robloxAgent = new https.Agent({ rejectUnauthorized: false });
const claimsPath = path.join(__dirname, '..', 'data', 'robloxAccessClaims.json');

function text(content) {
  return new TextDisplayBuilder().setContent(String(content || '').slice(0, 4000));
}

function plusConfig() {
  const baseUrl = config.Plus?.WebsiteUrl || config.Dashboard?.BaseUrl || 'http://localhost:3000';
  const plusUrl = config.Plus?.PlusUrl || `${baseUrl.replace(/\/$/, '')}/plus`;
  return {
    baseUrl,
    plusUrl,
    monthlySkuId: config.Plus?.MonthlySkuId,
    lifetimeSkuId: config.Plus?.LifetimeSkuId,
    passId: config.Access?.PlusGamePassId || 1856658557,
    passUrl: config.Access?.PlusGamePassUrl || 'https://www.roblox.com/game-pass/1856658557/Plus-Key-Lifetime',
  };
}

function validSku(id) {
  return typeof id === 'string' && /^\d{10,30}$/.test(id);
}

function robloxFetch(url, options = {}) {
  return fetch(url, { ...options, agent: robloxAgent });
}

async function commandMention(client, commandPath) {
  try {
    const topName = String(commandPath).split(' ')[0];
    const commands = await client.application.commands.fetch();
    const found = commands.find(command => command.name === topName);
    if (found) return `</${commandPath}:${found.id}>`;
  } catch {}
  return `\`/${commandPath}\``;
}

async function featuredCommands(client) {
  return Promise.all([
    commandMention(client, 'crypto price'),
    commandMention(client, 'crypto compare'),
    commandMention(client, 'website download'),
    commandMention(client, 'eco monthlyplus'),
    commandMention(client, 'themes list'),
  ]);
}

function linkedRoblox(discordId) {
  const claims = loadJson(claimsPath, {});
  return Object.values(claims).find(claim => String(claim.discordId) === String(discordId)) || null;
}

function setLinkedRoblox(discordId, robloxUser) {
  const claims = loadJson(claimsPath, {});
  const existing = claims[String(robloxUser.id)];
  if (existing && existing.discordId !== discordId) return { ok: false, existing };
  claims[String(robloxUser.id)] = {
    discordId,
    robloxUserId: robloxUser.id,
    robloxUsername: robloxUser.name,
    robloxDisplayName: robloxUser.displayName || robloxUser.name,
    highestPlan: 'linked',
    verifiedAt: Date.now(),
  };
  saveJson(claimsPath, claims);
  return { ok: true };
}

function unlinkRoblox(discordId) {
  const claims = loadJson(claimsPath, {});
  for (const [robloxId, claim] of Object.entries(claims)) {
    if (String(claim.discordId) === String(discordId)) delete claims[robloxId];
  }
  saveJson(claimsPath, claims);
}

async function getRobloxUser(username) {
  const cleanName = String(username || '').trim();
  const userId = await noblox.getIdFromUsername(cleanName).catch(() => null);
  if (userId) return getRobloxUserById(userId, cleanName);

  const res = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ usernames: [cleanName], excludeBannedUsers: true }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  const found = data?.data?.[0];
  if (!found?.id) return null;
  return getRobloxUserById(found.id, found.name || cleanName);
}

async function getRobloxUserById(userId, fallbackName = null) {
  const info = await noblox.getPlayerInfo(Number(userId)).catch(() => null);
  if (info?.username) {
    return {
      id: Number(userId),
      name: info.username,
      displayName: info.displayName || info.username,
    };
  }

  const res = await robloxFetch(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  return {
    id: Number(userId),
    name: data?.name || fallbackName || String(userId),
    displayName: data?.displayName || data?.name || fallbackName || String(userId),
  };
}

async function ownsGamePass(robloxUserId, gamePassId) {
  const url = `https://inventory.roblox.com/v1/users/${robloxUserId}/items/GamePass/${gamePassId}?limit=10`;
  const res = await robloxFetch(url, { headers: { Accept: 'application/json' } }).catch((err) => ({ networkError: err }));

  if (!res || res.networkError) return { ok: false, privateInventory: false, error: 'Roblox could not be reached right now.' };
  if (res.status === 403) return { ok: false, privateInventory: true };
  if (!res.ok) return { ok: false, privateInventory: false, error: `Roblox returned ${res.status}.` };

  const data = await res.json().catch(() => null);
  return { ok: Array.isArray(data?.data) && data.data.length > 0, privateInventory: false };
}

function baseContainer(title, lines, accent = 0x5865f2) {
  const container = new ContainerBuilder().setAccentColor(accent);
  container.addTextDisplayComponents(text([`## ${title}`, '', ...lines].join('\n')));
  return container;
}

async function addPlusPitch(container, client, mode = null) {
  const { baseUrl, plusUrl } = plusConfig();
  const commands = await featuredCommands(client);
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(text(
      [
        `By purchasing **[leaf Plus](${plusUrl})**, you help support [leaf](${baseUrl})'s development and unlock Plus-only features.`,
      ].join('\n'),
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(text(
      [
        `**Plus** features include ${commands.slice(0, -1).join(', ')}, and ${commands.at(-1)} - plus [much more](${plusUrl}).`,
        '',
        '> As a bonus, each month you will receive **`1,000,000`** cash for use in the rich economy.',
      ].join('\n'),
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(text(`You can view all **Plus** perks on our webpage at ${plusUrl}.`));

  if (mode === 'money') {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(text(`Crypto, PayPal, or other ways to pay? Join the [Support Server](${config.SupportServer}).`));
  }

  return container;
}

async function perkContainer(interaction) {
  const { baseUrl, plusUrl } = plusConfig();
  const commands = await featuredCommands(interaction.client);
  const container = baseContainer('leaf Plus Perks', [
    `Unlock the polished extras that support [leaf](${baseUrl}) and make the bot feel way more personal.`,
  ], 0xffb84d);

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(text([
      '**Best Plus commands**',
      commands.join(' ? '),
      '',
      '**Monthly economy reward**',
      'Claim **`1,000,000`** cash every month with `/eco monthlyplus`.',
      '',
      '**Dashboard appearance tools**',
      'Create, save, apply, and share custom embed themes from the web dashboard.',
      '',
      '**More powerful utilities**',
      'Plus unlocks higher-value tools like website downloads, advanced AI helpers, and premium lookup features.',
      '',
      `View everything on the [Plus page](${plusUrl}).`,
    ].join('\n')));

  if (!isPlusActive(interaction.user.id)) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`plus_buy:home:${interaction.user.id}`).setLabel('Buy Plus').setStyle(ButtonStyle.Primary),
      ),
    );
  }

  return container;
}

async function buildHome(interaction) {
  if (isPlusActive(interaction.user.id)) {
    return baseContainer('leaf Plus', ['You already own **leaf Plus**. You are good to go.']);
  }

  const container = baseContainer('leaf Plus', ['Choose how you want to unlock Plus.']);
  await addPlusPitch(container, interaction.client);
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(text('-# If you are seeing **Product Unavailable**, use Discord on PC or the web version on mobile.'))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`plus_buy:money:${interaction.user.id}`).setLabel('Money').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`plus_buy:robux:${interaction.user.id}`).setLabel('Robux').setStyle(ButtonStyle.Secondary),
      ),
    );
  return container;
}

async function buildMoney(interaction) {
  if (isPlusActive(interaction.user.id)) return buildHome(interaction);
  const { monthlySkuId, lifetimeSkuId } = plusConfig();
  const container = baseContainer('leaf Plus - Money', ['Buy Plus directly through Discord products.']);
  await addPlusPitch(container, interaction.client, 'money');
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(text('-# If you are seeing **Product Unavailable**, use Discord on PC or the web version on mobile.'));

  if (validSku(lifetimeSkuId) && validSku(monthlySkuId)) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(lifetimeSkuId),
        new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(monthlySkuId),
      ),
    );
  } else {
    container.addTextDisplayComponents(text('SKU IDs are not configured yet. Add `Plus.LifetimeSkuId` and `Plus.MonthlySkuId` in `config.json`, then restart leaf.'));
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`plus_buy:home:${interaction.user.id}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
    ),
  );
  return container;
}

async function buildRobux(interaction) {
  if (isPlusActive(interaction.user.id)) return buildHome(interaction);
  const { passUrl } = plusConfig();
  const linked = linkedRoblox(interaction.user.id);
  const container = baseContainer('leaf Plus - Robux', [
    linked
      ? `Linked Roblox account: **${linked.robloxDisplayName || linked.robloxUsername}** (@${linked.robloxUsername})`
      : 'Link your Roblox account first. After that, buy the gamepass and verify the purchase here.',
  ]);
  await addPlusPitch(container, interaction.client);
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(linked ? `plus_buy:unlink:${interaction.user.id}` : `plus_buy:link:${interaction.user.id}`)
          .setLabel(linked ? 'Unlink Roblox' : 'Link Roblox')
          .setStyle(linked ? ButtonStyle.Danger : ButtonStyle.Primary),
        new ButtonBuilder()
          .setLabel('Gamepass')
          .setStyle(ButtonStyle.Link)
          .setURL(passUrl)
          .setDisabled(!linked),
        new ButtonBuilder()
          .setCustomId(`plus_buy:verify:${interaction.user.id}`)
          .setLabel('Verify Purchase')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!linked),
        new ButtonBuilder()
          .setCustomId(`plus_buy:home:${interaction.user.id}`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  return container;
}

async function updateView(interaction, container) {
  const payload = {
    embeds: [],
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isButton()) return interaction.update(payload);
  return interaction.reply(payload);
}

function userFromCustomId(customId) {
  return String(customId || '').split(':').at(-1);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plus')
    .setDescription('leaf Plus membership')
    .addSubcommand(sub => sub.setName('buy').setDescription('Buy leaf Plus'))
    .addSubcommand(sub => sub.setName('perks').setDescription('View leaf Plus perks')),
  category: 'Utility',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'perks') return updateView(interaction, await perkContainer(interaction));
    if (sub !== 'buy') return;
    return updateView(interaction, await buildHome(interaction));
  },

  async handleButton(interaction) {
    if (userFromCustomId(interaction.customId) !== interaction.user.id) {
      return interaction.reply({ content: 'Only the user who opened this Plus menu can use these buttons.', ephemeral: true });
    }

    const action = interaction.customId.split(':')[1];
    if (action === 'home') return updateView(interaction, await buildHome(interaction));
    if (action === 'money') return updateView(interaction, await buildMoney(interaction));
    if (action === 'robux') return updateView(interaction, await buildRobux(interaction));

    if (action === 'link') {
      const modal = new ModalBuilder()
        .setCustomId(`plus_buy:link_modal:${interaction.user.id}`)
        .setTitle('Link Roblox');
      const username = new TextInputBuilder()
        .setCustomId('roblox_username')
        .setLabel('Roblox username')
        .setPlaceholder('Enter your Roblox username')
        .setStyle(TextInputStyle.Short)
        .setMinLength(3)
        .setMaxLength(20)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(username));
      return interaction.showModal(modal);
    }

    if (action === 'unlink') {
      unlinkRoblox(interaction.user.id);
      return updateView(interaction, await buildRobux(interaction));
    }

    if (action === 'verify') {
      await interaction.deferUpdate().catch(() => {});
      if (isPlusActive(interaction.user.id)) return updateView(interaction, await buildHome(interaction));
      const linked = linkedRoblox(interaction.user.id);
      if (!linked) return updateView(interaction, await buildRobux(interaction));

      const { passId } = plusConfig();
      const ownership = await ownsGamePass(linked.robloxUserId, passId);
      if (ownership.ok) {
        grantPlus(interaction.user.id, { source: 'roblox_gamepass_lifetime', label: 'Robux lifetime' });
        const claims = loadJson(claimsPath, {});
        if (claims[String(linked.robloxUserId)]) {
          claims[String(linked.robloxUserId)].highestPlan = 'plus';
          claims[String(linked.robloxUserId)].verifiedAt = Date.now();
          saveJson(claimsPath, claims);
        }
        return updateView(interaction, baseContainer('Access Granted', ['Your Roblox gamepass was verified and **leaf Plus lifetime** is now active.']));
      }

      const embed = await getUserEmbed(interaction.user.id, null, 'error');
      embed.setDescription(
        ownership.privateInventory
          ? 'Your Roblox inventory is private. Make it public and try again, or open a ticket in the support server.'
          : `I could not find the Plus gamepass on your linked Roblox account yet.${ownership.error ? `\n${ownership.error}` : ''}`,
      );
      return interaction.followUp({ embeds: [embed], ephemeral: true });
    }
  },

  async handleModal(interaction) {
    if (userFromCustomId(interaction.customId) !== interaction.user.id) {
      return interaction.reply({ content: 'Only the user who opened this Plus menu can use this modal.', ephemeral: true });
    }

    await interaction.deferUpdate().catch(() => {});
    const username = interaction.fields.getTextInputValue('roblox_username').trim();
    const robloxUser = await getRobloxUser(username);
    if (!robloxUser) {
      const embed = await getUserEmbed(interaction.user.id, null, 'error');
      embed.setDescription('That Roblox username does not exist. Check the spelling and try again.');
      return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    const linked = setLinkedRoblox(interaction.user.id, robloxUser);
    if (!linked.ok) {
      const embed = await getUserEmbed(interaction.user.id, null, 'error');
      embed.setDescription(`That Roblox account is already linked to <@${linked.existing.discordId}>.`);
      return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    return updateView(interaction, await buildRobux(interaction));
  },
};
