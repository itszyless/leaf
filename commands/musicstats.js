const { SlashCommandBuilder } = require('discord.js');
const config = require('../config.json');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

// node-fetch als dynamischer Import (funktioniert mit v3 im CommonJS)
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('musicstats')
    .setDMPermission(true)
    .setDescription('Get Spotify statistics for an artist or track')
    .addSubcommand(sub =>
      sub
        .setName('artist')
        .setDescription('Get Spotify stats for an artist')
        .addStringOption(opt =>
          opt
            .setName('query')
            .setDescription('Artist name')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('track')
        .setDescription('Get Spotify stats for a track')
        .addStringOption(opt =>
          opt
            .setName('query')
            .setDescription('Track name')
            .setRequired(true)
        )
    ),

  category: 'Utility',

  async execute(interaction) {
    const userId = interaction.user.id;
    const userLang = getUserLanguage(userId) || 'en';

    const clientId = config.Spotify_Client_ID;
    const clientSecret = config.Spotify_Client_Secret;

    if (!clientId || !clientSecret) {
      const errorText = await translateText('Spotify credentials are not configured. Please contact the administrator.', userLang);
      const errorEmbed = (await getUserEmbed(userId, null, 'error'))
        .setDescription(errorText);

      return interaction.editReply({ embeds: [errorEmbed] });
    }

    const subcommand = interaction.options.getSubcommand();
    const query = interaction.options.getString('query');

    // Spotify Access Token holen
    let accessToken;
    try {
      const tokenUrl = 'https://accounts.spotify.com/api/token';
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (!tokenRes.ok) {
        const errorText = await translateText('Failed to authenticate with the Spotify API.', userLang);
        const errorEmbed = (await getUserEmbed(userId, null, 'error'))
          .setDescription(errorText);

        return interaction.editReply({ embeds: [errorEmbed] });
      }

      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
    } catch (err) {
      console.error('Spotify token error:', err);
      const errorText = await translateText('An error occurred while connecting to Spotify.', userLang);
      const errorEmbed = (await getUserEmbed(userId, null, 'error'))
        .setDescription(errorText);

      return interaction.editReply({ embeds: [errorEmbed] });
    }

    // Suche vorbereiten
    let type;
    if (subcommand === 'artist') type = 'artist';
    if (subcommand === 'track') type = 'track';

    try {
      const searchUrl = new URL('https://api.spotify.com/v1/search');
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('type', type);
      searchUrl.searchParams.set('limit', '1');

      const searchRes = await fetch(searchUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!searchRes.ok) {
        const errorText = await translateText('The Spotify API returned an error.', userLang);
        const errorEmbed = (await getUserEmbed(userId, null, 'error'))
          .setDescription(errorText);

        return interaction.editReply({ embeds: [errorEmbed] });
      }

      const data = await searchRes.json();

      if (subcommand === 'artist') {
        const items = data.artists && data.artists.items;
        if (!items || items.length === 0) {
          const noResultText = await translateText('No artist was found for your search.', userLang);
          const errorEmbed = (await getUserEmbed(userId, null, 'error'))
            .setDescription(noResultText);

          return interaction.editReply({ embeds: [errorEmbed] });
        }

        const artist = items[0];

        const titleText = await translateText('Spotify artist stats', userLang);
        const followersLabel = await translateText('Followers', userLang);
        const popularityLabel = await translateText('Popularity', userLang);
        const genresLabel = await translateText('Genres', userLang);
        const linkLabel = await translateText('Open in Spotify', userLang);

        const followers = artist.followers ? artist.followers.total.toLocaleString() : '0';
        const popularity = `${artist.popularity || 0}/100`;
        const genres = artist.genres && artist.genres.length > 0 ? artist.genres.join(', ') : '-';
        const spotifyUrl = artist.external_urls ? artist.external_urls.spotify : null;

        const embed = (await getUserEmbed(userId, 'Music'))
          .setTitle(`${titleText}: ${artist.name}`)
          .addFields(
            { name: followersLabel, value: followers, inline: true },
            { name: popularityLabel, value: popularity, inline: true },
            { name: genresLabel, value: genres, inline: false }
          );

        if (spotifyUrl) {
          embed.setURL(spotifyUrl);
          embed.addFields({
            name: linkLabel,
            value: spotifyUrl,
            inline: false
          });
        }

        if (artist.images && artist.images.length > 0) {
          embed.setThumbnail(artist.images[0].url);
        }

        return interaction.editReply({ embeds: [embed] });
      }

      if (subcommand === 'track') {
        const items = data.tracks && data.tracks.items;
        if (!items || items.length === 0) {
          const noResultText = await translateText('No track was found for your search.', userLang);
          const errorEmbed = (await getUserEmbed(userId, null, 'error'))
            .setDescription(noResultText);

          return interaction.editReply({ embeds: [errorEmbed] });
        }

        const track = items[0];

        const titleText = await translateText('Spotify track stats', userLang);
        const artistLabel = await translateText('Artist', userLang);
        const albumLabel = await translateText('Album', userLang);
        const popularityLabel = await translateText('Popularity', userLang);
        const durationLabel = await translateText('Duration', userLang);
        const linkLabel = await translateText('Open in Spotify', userLang);

        const artistsNames = track.artists && track.artists.length > 0
          ? track.artists.map(a => a.name).join(', ')
          : '-';

        const albumName = track.album ? track.album.name : '-';
        const popularity = `${track.popularity || 0}/100`;

        const durationMs = track.duration_ms || 0;
        const totalSeconds = Math.floor(durationMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        const spotifyUrl = track.external_urls ? track.external_urls.spotify : null;
        const albumImage = track.album && track.album.images && track.album.images[0]
          ? track.album.images[0].url
          : null;

        const embed = (await getUserEmbed(userId, 'Music'))
          .setTitle(`${titleText}: ${track.name}`)
          .addFields(
            { name: artistLabel, value: artistsNames, inline: true },
            { name: albumLabel, value: albumName, inline: true },
            { name: popularityLabel, value: popularity, inline: true },
            { name: durationLabel, value: durationFormatted, inline: true }
          );

        if (spotifyUrl) {
          embed.setURL(spotifyUrl);
          embed.addFields({
            name: linkLabel,
            value: spotifyUrl,
            inline: false
          });
        }

        if (albumImage) {
          embed.setThumbnail(albumImage);
        }

        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('Spotify search error:', err);
      const errorText = await translateText('An unexpected error occurred while fetching music stats.', userLang);
      const errorEmbed = (await getUserEmbed(userId, null, 'error'))
        .setDescription(errorText);

      return interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

