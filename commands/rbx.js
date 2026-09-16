const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const https = require('https');
const fs = require('fs');
const path = require('path');
const noblox = require('../utils/robloxUsers');
const { getUserEmbed } = require('../utils/getUserEmbed');

const dataDir = path.join(__dirname, '..', 'data');
const claimsPath = path.join(dataDir, 'robloxAccessClaims.json');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const robloxAgent = new https.Agent({ rejectUnauthorized: false });

const currencyRates = {
  usd: { label: 'USD', symbol: '$', rate: 10020.04 / 100 },
  eur: { label: 'EUR', symbol: '?', rate: 8347.25 / 100 },
  sar: { label: 'SAR', symbol: 'Ø±.Ø³', rate: 2000.8 / 100 },
  gbp: { label: 'GBP', symbol: '£', rate: 10020.04 / 100 },
  cad: { label: 'CAD', symbol: '$', rate: 5722.46 / 100 },
};

function robloxFetch(url, options = {}) {
  return fetch(url, { ...options, agent: robloxAgent });
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function fmtDate(value) {
  if (!value) return 'Unknown';
  const time = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(time) ? `<t:${time}:D> (<t:${time}:R>)` : 'Unknown';
}

function truncate(text, max = 900) {
  const str = String(text || '').trim();
  if (!str) return 'No description.';
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}
function loadJsonFile(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8') || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function saveJsonFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getClaimByDiscordId(discordId) {
  const claims = loadJsonFile(claimsPath, {});
  const entry = Object.entries(claims).find(([, claim]) => String(claim.discordId) === String(discordId));
  return entry ? { robloxId: entry[0], claim: entry[1] } : null;
}

function removeClaimsByDiscordId(discordId) {
  const claims = loadJsonFile(claimsPath, {});
  const removed = [];
  for (const [robloxId, claim] of Object.entries(claims)) {
    if (String(claim.discordId) === String(discordId)) {
      removed.push(claim);
      delete claims[robloxId];
    }
  }
  if (removed.length) saveJsonFile(claimsPath, claims);
  return removed;
}

async function getRobloxUser(username) {
  const cleanName = String(username || '').trim();
  const id = await noblox.getIdFromUsername(cleanName).catch(() => null);
  if (id) return getRobloxUserById(id, cleanName);

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
      username: info.username,
      displayName: info.displayName || info.username,
      blurb: info.blurb || '',
      joinDate: info.joinDate || null,
      age: info.age || null,
      isBanned: false,
    };
  }

  const res = await robloxFetch(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  return {
    id: Number(userId),
    username: data?.name || fallbackName || String(userId),
    displayName: data?.displayName || data?.name || fallbackName || String(userId),
    blurb: data?.description || '',
    joinDate: data?.created || null,
    age: null,
    isBanned: Boolean(data?.isBanned),
  };
}

async function getJson(url, fallback = null) {
  const res = await robloxFetch(url).catch(() => null);
  if (!res || !res.ok) return fallback;
  return res.json().catch(() => fallback);
}

async function getUserCount(userId, type) {
  const data = await getJson(`https://friends.roblox.com/v1/users/${userId}/${type}/count`, null);
  return typeof data?.count === 'number' ? data.count : null;
}

async function getUserHeadshot(userId) {
  const data = await getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`, null);
  return data?.data?.[0]?.imageUrl || null;
}

async function getUserAvatar(userId) {
  const data = await getJson(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`, null);
  return data?.data?.[0]?.imageUrl || null;
}

async function getUniverseIdFromPlace(placeId) {
  const data = await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, null);
  return data?.universeId || null;
}

async function getGameInfo(placeId) {
  const universeId = await getUniverseIdFromPlace(placeId);
  if (!universeId) return null;

  const gameData = await getJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`, null);
  const game = gameData?.data?.[0];
  if (!game) return null;

  const votes = await getJson(`https://games.roblox.com/v1/games/votes?universeIds=${universeId}`, null);
  const vote = votes?.data?.[0] || null;
  const thumb = await getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`, null);
  const iconUrl = thumb?.data?.[0]?.imageUrl || null;

  return { universeId, game, vote, iconUrl };
}


async function getPaged(url, limit = 10) {
  const data = await getJson(url, null);
  return Array.isArray(data?.data) ? data.data.slice(0, limit) : [];
}
async function getCursorPages(baseUrl, maxItems = 200) {
  const results = [];
  let cursor = null;

  while (results.length < maxItems) {
    const joiner = baseUrl.includes('?') ? '&' : '?';
    const url = cursor ? `${baseUrl}${joiner}cursor=${encodeURIComponent(cursor)}` : baseUrl;
    const data = await getJson(url, null);
    if (!Array.isArray(data?.data)) break;
    results.push(...data.data);
    cursor = data.nextPageCursor;
    if (!cursor || data.data.length === 0) break;
  }

  return results.slice(0, maxItems);
}

function chunk(items, size) {
  const pages = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages.length ? pages : [[]];
}

function robloxName(item) {
  return item.name || item.username || item.userName || item.displayName || 'Unknown';
}

function robloxDisplay(item) {
  return item.displayName || item.name || item.username || item.userName || 'Unknown';
}

async function sendPagedList(interaction, title, items, renderLine, emptyText, perPage = 10) {
  const pages = chunk(items, perPage);
  let page = 0;

  const render = async () => {
    const embed = await getUserEmbed(interaction.user.id, title);
    const current = pages[page];
    embed.setTitle(title);
    embed.setDescription(current.length ? current.map((item, idx) => renderLine(item, page * perPage + idx)).join('\n') : emptyText);
    embed.setFooter({ text: `Page ${page + 1}/${pages.length} - ${items.length} shown` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rbx_page_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('rbx_page_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages.length - 1),
    );
    return { embeds: [embed], components: pages.length > 1 ? [row] : [] };
  };

  const message = await interaction.editReply(await render());
  if (pages.length <= 1) return;

  const collector = message.createMessageComponentCollector({ time: 120000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({ content: 'This menu is not for you.', ephemeral: true });
    }

    if (i.customId === 'rbx_page_prev' && page > 0) page--;
    if (i.customId === 'rbx_page_next' && page < pages.length - 1) page++;
    await i.update(await render());
  });

  collector.on('end', async () => {
    const rendered = await render();
    for (const row of rendered.components) for (const component of row.components) component.setDisabled(true);
    message.edit(rendered).catch(() => {});
  });
}


async function getAssetThumb(assetIds, size = '150x150') {
  if (!assetIds.length) return [];
  const data = await getJson(`https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(',')}&size=${size}&format=Png&isCircular=false`, null);
  return data?.data || [];
}

async function getGamepassThumb(passIds) {
  if (!passIds.length) return [];
  const data = await getJson(`https://thumbnails.roblox.com/v1/game-passes?gamePassIds=${passIds.join(',')}&size=150x150&format=Png&isCircular=false`, null);
  return data?.data || [];
}

function percent(up, down) {
  const total = Number(up || 0) + Number(down || 0);
  if (!total) return 'No votes';
  return `${Math.round((Number(up || 0) / total) * 100)}%`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roblox')
    .setDescription('Roblox tools and lookups')
    .addSubcommand(sub =>
      sub
        .setName('convert')
        .setDescription('Convert real currency to Robux')
        .addStringOption(opt =>
          opt
            .setName('currency')
            .setDescription('Currency to convert from')
            .setRequired(true)
            .addChoices(
              { name: 'USD ($)', value: 'usd' },
              { name: 'EUR (?)', value: 'eur' },
              { name: 'SAR (Ø±.Ø³)', value: 'sar' },
              { name: 'GBP (£)', value: 'gbp' },
              { name: 'CAD ($)', value: 'cad' },
            )
        )
        .addNumberOption(opt => opt.setName('amount').setDescription('Amount in currency').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('devex')
        .setDescription('Estimate DevEx USD from Robux')
        .addIntegerOption(opt => opt.setName('robux').setDescription('Robux amount to exchange').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('userinfo')
        .setDescription('Look up a Roblox user')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('gameinfo')
        .setDescription('Look up a Roblox game by place ID')
        .addIntegerOption(opt => opt.setName('placeid').setDescription('Roblox place ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('avatar')
        .setDescription('Show a Roblox user avatar render')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('outfits')
        .setDescription('Show recent public Roblox outfits')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('groups')
        .setDescription('Show Roblox groups for a user')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('badges')
        .setDescription('Show recent public Roblox badges')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('friends')
        .setDescription('Show Roblox friends for a user')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('inventory')
        .setDescription('Show public Roblox inventory items')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(opt => opt.setName('type').setDescription('Inventory type').setRequired(false).addChoices(
          { name: 'Hat', value: 'Hat' },
          { name: 'Hair Accessory', value: 'HairAccessory' },
          { name: 'Face Accessory', value: 'FaceAccessory' },
          { name: 'Shirt', value: 'Shirt' },
          { name: 'Pants', value: 'Pants' },
          { name: 'Gear', value: 'Gear' }
        ))
    )
    .addSubcommand(sub =>
      sub
        .setName('gamepasses')
        .setDescription('Show public gamepasses created by a user')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('servers')
        .setDescription('Show public servers for a Roblox place')
        .addIntegerOption(opt => opt.setName('placeid').setDescription('Roblox place ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('thumbnail')
        .setDescription('Show a Roblox game thumbnail/icon')
        .addIntegerOption(opt => opt.setName('placeid').setDescription('Roblox place ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('username-history')
        .setDescription('Show Roblox username history if public')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('link')
        .setDescription('Link your Roblox connection')
    )
    .addSubcommand(sub =>
      sub
        .setName('unlink')
        .setDescription('Remove your linked Roblox account')
    ),
  category: 'Roblox',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'link') {
      const existing = getClaimByDiscordId(interaction.user.id);
      const embed = await getUserEmbed(interaction.user.id, 'Roblox Link');

      if (existing) {
        const claim = existing.claim;
        embed.setDescription(
          `You are already linked to **${claim.robloxDisplayName || claim.robloxUsername}** (@${claim.robloxUsername}).\n` +
          `Roblox ID: \`${claim.robloxUserId}\`\n\n` +
          'Use `/roblox unlink` first if you want to remove this connection.',
        );
        return interaction.editReply({ embeds: [embed] });
      }

      embed.setDescription(
        'Discord does not include connected Roblox accounts in normal slash command interactions. ' +
        'To verify through your Discord Roblox connection, leaf needs an OAuth2 login flow with the `connections` scope.\n\n' +
        'For now, use `/access` to verify through the Roblox gamepass purchase, or ask support to verify you manually.',
      );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'unlink') {
      const removed = removeClaimsByDiscordId(interaction.user.id);
      const embed = await getUserEmbed(interaction.user.id, 'Roblox Unlink');

      if (!removed.length) {
        embed.setDescription('You do not have a Roblox account linked right now.');
        return interaction.editReply({ embeds: [embed] });
      }

      const names = removed.map(claim => `**${claim.robloxDisplayName || claim.robloxUsername}** (@${claim.robloxUsername})`).join('\n');
      embed.setDescription(`${names}\n\nYour Roblox connection was removed. Your Plus access was not changed.`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'convert') {
      const currency = interaction.options.getString('currency');
      const amount = interaction.options.getNumber('amount');
      const selected = currencyRates[currency];
      const robux = amount * selected.rate;

      const embed = await getUserEmbed(interaction.user.id, 'Robux Conversion');
      embed
        .setTitle('Robux Conversion')
        .setDescription(
          `**${selected.symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${selected.label}**\n` +
          `? **R$ ${robux.toLocaleString('en-US', { maximumFractionDigits: 0 })}**`
        )
        .addFields(
          { name: 'Rate Used', value: `R$ ${selected.rate.toLocaleString('en-US', { maximumFractionDigits: 2 })} per ${selected.label}`, inline: true },
          { name: 'Note', value: 'Estimate only. Roblox package pricing can vary.', inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'devex') {
      const robux = interaction.options.getInteger('robux');
      const usdBeforeFee = (robux / 30500) * 105;
      const usdAfterFee = Math.max(0, usdBeforeFee - 5);

      const embed = await getUserEmbed(interaction.user.id, 'DevEx Estimate');
      embed
        .setTitle('DevEx Estimate')
        .setDescription(`**R$ ${fmtNumber(robux)}** ? **$${usdAfterFee.toFixed(2)} USD** after estimated fee.`)
        .addFields(
          { name: 'Base Rate', value: 'R$ 30,500 = $105.00', inline: true },
          { name: 'Estimated Fee', value: '$5.00', inline: true },
          { name: 'Before Fee', value: `$${usdBeforeFee.toFixed(2)}`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'userinfo') {
      const username = interaction.options.getString('username');
      const user = await getRobloxUser(username);
      if (!user) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox user. Check the username and try again.');
        return interaction.editReply({ embeds: [err] });
      }

      const [friends, followers, following, headshot, avatar] = await Promise.all([
        getUserCount(user.id, 'friends'),
        getUserCount(user.id, 'followers'),
        getUserCount(user.id, 'followings'),
        getUserHeadshot(user.id),
        getUserAvatar(user.id),
      ]);

      const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;
      const embed = await getUserEmbed(interaction.user.id, 'Roblox User');
      embed
        .setTitle(`${user.displayName} (@${user.username})`)
        .setURL(profileUrl)
        .setDescription(truncate(user.blurb, 700))
        .addFields(
          { name: 'User ID', value: `\`${user.id}\``, inline: true },
          { name: 'Account Created', value: fmtDate(user.joinDate), inline: true },
          { name: 'Account Age', value: user.age ? `${fmtNumber(user.age)} days` : 'Unknown', inline: true },
          { name: 'Friends', value: friends === null ? 'Unknown' : fmtNumber(friends), inline: true },
          { name: 'Followers', value: followers === null ? 'Unknown' : fmtNumber(followers), inline: true },
          { name: 'Following', value: following === null ? 'Unknown' : fmtNumber(following), inline: true },
          { name: 'Status', value: user.isBanned ? 'Banned' : 'Active', inline: true },
        );
      if (headshot) embed.setThumbnail(headshot);
      if (avatar) embed.setImage(avatar);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Open Profile').setStyle(ButtonStyle.Link).setURL(profileUrl),
      );
      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    if (sub === 'gameinfo') {
      const placeId = interaction.options.getInteger('placeid');
      const info = await getGameInfo(placeId);
      if (!info) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find a Roblox game for that place ID.');
        return interaction.editReply({ embeds: [err] });
      }

      const { universeId, game, vote, iconUrl } = info;
      const gameUrl = `https://www.roblox.com/games/${placeId}`;
      const creator = game.creator ? `${game.creator.name} (${game.creator.type})` : 'Unknown';
      const embed = await getUserEmbed(interaction.user.id, 'Roblox Game');
      embed
        .setTitle(game.name || 'Roblox Game')
        .setURL(gameUrl)
        .setDescription(truncate(game.description, 900))
        .addFields(
          { name: 'Place ID', value: `\`${placeId}\``, inline: true },
          { name: 'Universe ID', value: `\`${universeId}\``, inline: true },
          { name: 'Creator', value: creator, inline: true },
          { name: 'Playing', value: fmtNumber(game.playing), inline: true },
          { name: 'Visits', value: fmtNumber(game.visits), inline: true },
          { name: 'Favorites', value: fmtNumber(game.favoritedCount), inline: true },
          { name: 'Max Players', value: fmtNumber(game.maxPlayers), inline: true },
          { name: 'Created', value: fmtDate(game.created), inline: true },
          { name: 'Updated', value: fmtDate(game.updated), inline: true },
          { name: 'Rating', value: vote ? `${percent(vote.upVotes, vote.downVotes)} (${fmtNumber(vote.upVotes)} up / ${fmtNumber(vote.downVotes)} down)` : 'Unknown', inline: false },
        );
      if (iconUrl) embed.setThumbnail(iconUrl);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Open Game').setStyle(ButtonStyle.Link).setURL(gameUrl),
      );
      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    if (sub === 'avatar') {
      const user = await getRobloxUser(interaction.options.getString('username'));
      if (!user) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox user.');
        return interaction.editReply({ embeds: [err] });
      }
      const [avatar, headshot] = await Promise.all([getUserAvatar(user.id), getUserHeadshot(user.id)]);
      const embed = await getUserEmbed(interaction.user.id, 'Roblox Avatar');
      embed.setTitle(`${user.displayName} (@${user.username})`).setURL(`https://www.roblox.com/users/${user.id}/profile`).setDescription(`User ID: \`${user.id}\``);
      if (headshot) embed.setThumbnail(headshot);
      if (avatar) embed.setImage(avatar);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'outfits') {
      const user = await getRobloxUser(interaction.options.getString('username'));
      if (!user) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox user.');
        return interaction.editReply({ embeds: [err] });
      }
      const outfits = await getCursorPages(`https://avatar.roblox.com/v1/users/${user.id}/outfits?itemsPerPage=100`, 200);
      return sendPagedList(interaction, `${user.username}'s Outfits`, outfits, (o, i) => `**${i + 1}.** ${o.name || 'Outfit'} - \`${o.id}\``, 'No public outfits found.');
    }

    if (sub === 'groups') {
      const user = await getRobloxUser(interaction.options.getString('username'));
      if (!user) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox user.');
        return interaction.editReply({ embeds: [err] });
      }
      const data = await getJson(`https://groups.roblox.com/v2/users/${user.id}/groups/roles`, null);
      const groups = (data?.data || []).slice(0, 200);
      return sendPagedList(interaction, `${user.username}'s Groups`, groups, (g, i) => `**${i + 1}.** ${g.group?.name || 'Unknown group'}\n> Role: **${g.role?.name || 'Member'}** | Members: **${fmtNumber(g.group?.memberCount)}**`, 'No public groups found.');
    }

    if (sub === 'badges') {
      const user = await getRobloxUser(interaction.options.getString('username'));
      if (!user) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox user.');
        return interaction.editReply({ embeds: [err] });
      }
      const badges = await getCursorPages(`https://badges.roblox.com/v1/users/${user.id}/badges?limit=100&sortOrder=Desc`, 200);
      return sendPagedList(interaction, `${user.username}'s Recent Badges`, badges, (b, i) => `**${i + 1}.** ${b.name || 'Badge'}\n> ${truncate(b.description, 90)}`, 'No public badges found.');
    }

    if (sub === 'friends') {
      const user = await getRobloxUser(interaction.options.getString('username'));
      if (!user) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox user.');
        return interaction.editReply({ embeds: [err] });
      }
      const data = await getJson(`https://friends.roblox.com/v1/users/${user.id}/friends`, null);
      const friends = (data?.data || []).slice(0, 200);
      return sendPagedList(interaction, `${user.username}'s Friends`, friends, (f, i) => `**${i + 1}.** ${robloxDisplay(f)} (@${robloxName(f)})`, 'No public friends found.', 15);
    }

    if (sub === 'inventory') {
      const user = await getRobloxUser(interaction.options.getString('username'));
      const type = interaction.options.getString('type') || 'Hat';
      if (!user) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox user.');
        return interaction.editReply({ embeds: [err] });
      }
      const items = await getCursorPages(`https://inventory.roblox.com/v2/users/${user.id}/inventory/${type}?limit=100&sortOrder=Desc`, 200);
      return sendPagedList(interaction, `${user.username}'s ${type} Inventory`, items, (item, i) => `**${i + 1}.** ${item.name || item.assetName || 'Item'} - \`${item.assetId || item.id}\``, 'No public items found, or inventory is private.');
    }

    if (sub === 'gamepasses') {
      const user = await getRobloxUser(interaction.options.getString('username'));
      if (!user) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox user.');
        return interaction.editReply({ embeds: [err] });
      }
      const ownedPasses = await getCursorPages(`https://inventory.roblox.com/v2/users/${user.id}/inventory/GamePass?limit=100&sortOrder=Desc`, 200);
      const passes = ownedPasses.map((pass) => ({
        name: pass.name || pass.assetName || 'Gamepass',
        id: pass.assetId || pass.id,
        gameName: 'Owned Gamepass',
        price: pass.price,
      }));

      if (passes.length === 0) {
        const games = await getCursorPages(`https://games.roblox.com/v2/users/${user.id}/games?accessFilter=Public&limit=50&sortOrder=Desc`, 100);
        for (const game of games) {
          const universeId = game.id || game.universeId;
          const page = await getCursorPages(`https://games.roblox.com/v1/games/${universeId}/game-passes?limit=100&sortOrder=Desc`, 100);
          for (const pass of page) passes.push({ ...pass, gameName: game.name });
          if (passes.length >= 200) break;
        }
      }

      return sendPagedList(interaction, `${user.username}'s Gamepasses`, passes.slice(0, 200), (p, i) => `**${i + 1}.** ${p.name || 'Gamepass'}${p.id ? ` - \`${p.id}\`` : ''}\n> ${p.gameName || 'Unknown'}${typeof p.price === 'number' ? ` | Price: R$ ${fmtNumber(p.price)}` : ''}`, 'No public gamepasses found.');
    }

    if (sub === 'servers') {
      const placeId = interaction.options.getInteger('placeid');
      const servers = await getCursorPages(`https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Desc&limit=100`, 100);
      return sendPagedList(interaction, `Public Servers for Place ${placeId}`, servers, (s, i) => `**${i + 1}.** ${fmtNumber(s.playing)}/${fmtNumber(s.maxPlayers)} players\n> Ping: ${s.ping || 'Unknown'} | FPS: ${s.fps ? Math.round(s.fps) : 'Unknown'}`, 'No public servers found.');
    }
    if (sub === 'thumbnail') {
      const placeId = interaction.options.getInteger('placeid');
      const info = await getGameInfo(placeId);
      if (!info) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox game.');
        return interaction.editReply({ embeds: [err] });
      }
      const data = await getJson(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${info.universeId}&countPerUniverse=1&defaults=true&size=768x432&format=Png&isCircular=false`, null);
      const image = data?.data?.[0]?.thumbnails?.[0]?.imageUrl || info.iconUrl;
      const embed = await getUserEmbed(interaction.user.id, 'Roblox Thumbnail');
      embed.setTitle(info.game.name).setURL(`https://www.roblox.com/games/${placeId}`);
      if (image) embed.setImage(image);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'username-history') {
      const user = await getRobloxUser(interaction.options.getString('username'));
      if (!user) {
        const err = await getUserEmbed(interaction.user.id, null, 'error');
        err.setDescription('I could not find that Roblox user.');
        return interaction.editReply({ embeds: [err] });
      }
      const data = await getJson(`https://users.roblox.com/v1/users/${user.id}/username-history?limit=10&sortOrder=Desc`, null);
      const names = data?.data || [];
      const embed = await getUserEmbed(interaction.user.id, 'Roblox Username History');
      embed.setTitle(`${user.username}'s Username History`).setDescription(names.length ? names.map((n, i) => `**${i + 1}.** ${n.name}`).join('\n') : 'No public username history found.');
      return interaction.editReply({ embeds: [embed] });
    }

  },
};





