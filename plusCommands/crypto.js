const { SlashCommandBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { createCanvas } = require('canvas');
const { getUserLanguage } = require('../utils/langStorage');
const { translateText } = require('../utils/translator');
const { getUserEmbed } = require('../utils/getUserEmbed');

const topCoins = [
  { name: 'Bitcoin', value: 'bitcoin' },
  { name: 'Ethereum', value: 'ethereum' },
  { name: 'Tether', value: 'tether' },
  { name: 'BNB', value: 'binancecoin' },
  { name: 'Solana', value: 'solana' },
  { name: 'XRP', value: 'ripple' },
  { name: 'USDC', value: 'usd-coin' },
  { name: 'Cardano', value: 'cardano' },
  { name: 'Dogecoin', value: 'dogecoin' },
  { name: 'Avalanche', value: 'avalanche-2' },
];

const compareColors = {
  first: '#4d8cff',
  second: '#ff9f2e',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crypto')
    .setDescription('Cryptocurrency commands (Plus only)')
    .addSubcommand(sub =>
      sub
        .setName('price')
        .setDescription('Show price chart of a coin')
        .addStringOption(opt => opt.setName('coin').setDescription('Coin id, e.g., bitcoin, ethereum').setRequired(true))
        .addStringOption(opt => opt.setName('chart').setDescription('Chart style').addChoices(
          { name: 'Line (24h)', value: 'line' },
          { name: 'Candlesticks (24h)', value: 'candles' },
        ))
    )
    .addSubcommand(sub =>
      sub
        .setName('compare')
        .setDescription('Compare two coins over the last 24 hours')
        .addStringOption(opt => opt.setName('coin1').setDescription('First coin id, e.g., bitcoin').setRequired(true))
        .addStringOption(opt => opt.setName('coin2').setDescription('Second coin id, e.g., ethereum').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('gainloss')
        .setDescription('Calculate crypto gain or loss from a past buy')
        .addStringOption(opt => opt.setName('coin').setDescription('Coin id, e.g., bitcoin, ethereum').setRequired(true))
        .addNumberOption(opt => opt.setName('amount').setDescription('USD amount invested').setRequired(true).setMinValue(1))
        .addIntegerOption(opt => opt.setName('days').setDescription('How many days ago you bought').setRequired(true).setMinValue(1).setMaxValue(365))
    )
    .addSubcommand(sub =>
      sub
        .setName('convert')
        .setDescription('Convert between top 10 cryptocurrencies')
        .addStringOption(opt => opt.setName('from').setDescription('From coin').setRequired(true).addChoices(...topCoins))
        .addStringOption(opt => opt.setName('to').setDescription('To coin').setRequired(true).addChoices(...topCoins))
        .addNumberOption(opt => opt.setName('amount').setDescription('Amount to convert').setRequired(true))
    ),
  category: 'Plus',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const lang = getUserLanguage(interaction.user.id) || 'en';

    if (sub === 'price') {
      const coin = interaction.options.getString('coin').toLowerCase();
      const chart = interaction.options.getString('chart') || 'line';

      try {
        const market = await fetchMarketData(coin);
        let buffer;
        let label;

        if (chart === 'candles') {
          const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coin}/ohlc?vs_currency=usd&days=1`);
          if (!res.ok) throw new Error('OHLC API error');
          const ohlc = await res.json();
          if (!Array.isArray(ohlc) || !ohlc.length) throw new Error('No OHLC data');
          buffer = drawCryptoChart({ coin, type: 'candles', rows: ohlc, market });
          label = await translateText('Candlestick chart for', lang);
        } else {
          const data = await fetchChartData(coin, 1);
          if (!Array.isArray(data.prices) || !data.prices.length) {
            return interaction.editReply({ content: await translateText('No price data available for this coin.', lang) });
          }
          buffer = drawCryptoChart({ coin, type: 'line', rows: data.prices, market });
          label = await translateText('Line chart for', lang);
        }

        const title = coinTitle(market, coin);
        const linkedTitle = `[${title}](${tradingViewUrl(market.symbol || coin)})`;
        const stats = await formatMarketStats(market, lang);
        const last24 = await translateText('last 24 hours', lang);
        const embed = (await getUserEmbed(interaction.user.id, `Crypto: ${title}`))
          .setDescription(`${label} **${linkedTitle}** (${last24})\n\n${stats}`)
          .setImage('attachment://chart.png');

        return interaction.editReply({ embeds: [embed], files: [{ attachment: buffer, name: 'chart.png' }] });
      } catch (err) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error')).setDescription(
          await translateText('Failed to fetch coin data. Make sure the coin id is correct.', lang)
        );
        return interaction.editReply({ embeds: [embed] });
      }
    }

    if (sub === 'compare') {
      const coin1 = interaction.options.getString('coin1').toLowerCase();
      const coin2 = interaction.options.getString('coin2').toLowerCase();

      if (coin1 === coin2) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error')).setDescription(
          await translateText('Please choose two different coins.', lang)
        );
        return interaction.editReply({ embeds: [embed] });
      }

      try {
        const [market1, market2, chart1, chart2] = await Promise.all([
          fetchMarketData(coin1),
          fetchMarketData(coin2),
          fetchChartData(coin1, 1),
          fetchChartData(coin2, 1),
        ]);

        if (!Array.isArray(chart1.prices) || !chart1.prices.length || !Array.isArray(chart2.prices) || !chart2.prices.length) {
          throw new Error('Missing compare chart data');
        }

        const title1 = coinTitle(market1, coin1);
        const title2 = coinTitle(market2, coin2);
        const buffer = drawCompareChart({
          first: { coin: coin1, market: market1, rows: chart1.prices, title: title1, color: compareColors.first },
          second: { coin: coin2, market: market2, rows: chart2.prices, title: title2, color: compareColors.second },
        });

        const [comparisonLabel, firstLabel, secondLabel, noteLabel] = await Promise.all([
          translateText('24h performance comparison', lang),
          translateText('First coin', lang),
          translateText('Second coin', lang),
          translateText('Lines are normalized to percent change from the first chart point.', lang),
        ]);
        const linked1 = `[${title1}](${tradingViewUrl(market1.symbol || coin1)})`;
        const linked2 = `[${title2}](${tradingViewUrl(market2.symbol || coin2)})`;
        const blueCircle = '\u{1F535}';
        const orangeCircle = '\u{1F7E0}';
        const embed = (await getUserEmbed(interaction.user.id, 'Crypto: Compare'))
          .setDescription(`**${comparisonLabel}:** ${linked1} vs ${linked2}\n${blueCircle} **${firstLabel}:** ${title1}\n${orangeCircle} **${secondLabel}:** ${title2}\n\n${noteLabel}`)
          .setImage('attachment://crypto-compare.png');

        return interaction.editReply({ embeds: [embed], files: [{ attachment: buffer, name: 'crypto-compare.png' }] });
      } catch (err) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error')).setDescription(
          await translateText('Failed to compare coins. Make sure both coin ids are correct.', lang)
        );
        return interaction.editReply({ embeds: [embed] });
      }
    }

    if (sub === 'gainloss') {
      const coin = interaction.options.getString('coin').toLowerCase();
      const amount = interaction.options.getNumber('amount');
      const days = interaction.options.getInteger('days');

      try {
        const [market, chart] = await Promise.all([
          fetchMarketData(coin),
          fetchChartData(coin, days),
        ]);
        if (!Array.isArray(chart.prices) || chart.prices.length < 2) throw new Error('Missing gainloss chart data');

        const startPrice = Number(chart.prices[0][1]);
        const endPrice = Number(chart.prices[chart.prices.length - 1][1]);
        if (!startPrice || !endPrice) throw new Error('Invalid price data');

        const coinAmount = amount / startPrice;
        const currentValue = coinAmount * endPrice;
        const gainLoss = currentValue - amount;
        const gainPct = (gainLoss / amount) * 100;
        const emoji = gainLoss >= 0 ? '\u{1F4C8}' : '\u{1F4C9}';
        const title = coinTitle(market, coin);
        const linkedTitle = `[${title}](${tradingViewUrl(market.symbol || coin)})`;
        const [investedLabel, thenPriceLabel, nowPriceLabel, valueLabel, gainLossLabel, daysAgoLabel] = await Promise.all([
          translateText('Invested', lang),
          translateText('Then Price', lang),
          translateText('Now Price', lang),
          translateText('Current Value', lang),
          translateText('Gain/Loss', lang),
          translateText('days ago', lang),
        ]);

        const embed = (await getUserEmbed(interaction.user.id, `Crypto: ${title}`))
          .setDescription([
            `**${investedLabel}:** ${formatUsdNumber(amount)} USD in **${linkedTitle}** (${formatAxis(days)} ${daysAgoLabel})`,
            `**${thenPriceLabel}:** ${formatUsdNumber(startPrice)} USD`,
            `**${nowPriceLabel}:** ${formatUsdNumber(endPrice)} USD`,
            `**${valueLabel}:** ${formatUsdNumber(currentValue)} USD`,
            `**${gainLossLabel}:** ${formatSignedUsd(gainLoss)} (${formatSignedPercent(gainPct)}) ${emoji}`,
          ].join('\n'));

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error')).setDescription(
          await translateText('Failed to calculate gain or loss. Make sure the coin id is correct.', lang)
        );
        return interaction.editReply({ embeds: [embed] });
      }
    }

    if (sub === 'convert') {
      const from = interaction.options.getString('from');
      const to = interaction.options.getString('to');
      const amount = interaction.options.getNumber('amount');

      if (from === to) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error')).setDescription(
          await translateText('Please choose two different coins.', lang)
        );
        return interaction.editReply({ embeds: [embed] });
      }

      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${from},${to}&vs_currencies=usd`;
        const res = await fetch(url);
        const data = await res.json();
        const fromPrice = data[from]?.usd;
        const toPrice = data[to]?.usd;
        if (!fromPrice || !toPrice) throw new Error('Price data missing');

        const fromTotalUSD = fromPrice * amount;
        const convertedAmount = fromTotalUSD / toPrice;
        const pp = await translateText('is worth', lang);
        const embed = (await getUserEmbed(interaction.user.id, 'Crypto: Convert'))
          .setDescription(`**${formatAbbrev(amount)} ${capitalize(from)}** ${pp} **${formatAbbrev(convertedAmount)} ${capitalize(to)}**\n\n(≈ ${formatCurrencyAbbrev(fromTotalUSD)})`);

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        const embed = (await getUserEmbed(interaction.user.id, null, 'error')).setDescription(
          await translateText('Failed to convert coins. Try again later.', lang)
        );
        return interaction.editReply({ embeds: [embed] });
      }
    }
  },
};

async function fetchMarketData(coin) {
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coin}&price_change_percentage=24h`);
  if (!res.ok) throw new Error('Market API error');
  const data = await res.json();
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error('Missing market data');
  return row;
}

async function fetchChartData(coin, days = 1) {
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=${days}`);
  if (!res.ok) throw new Error('Chart API error');
  return res.json();
}

function drawCryptoChart({ coin, type, rows, market }) {
  const width = 2048;
  const height = 860;
  const pad = { left: 150, right: 84, top: 52, bottom: 92 };
  const graphW = width - pad.left - pad.right;
  const graphH = height - pad.top - pad.bottom;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const bg = '#111720';
  const grid = '#26374f';
  const text = '#b6bfd3';
  const muted = '#9ba6ba';
  const blue = '#4d8cff';
  const orange = '#ff9f2e';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const values = type === 'candles'
    ? rows.flatMap(row => [row[2], row[3]])
    : rows.map(row => row[1]);
  const maxRaw = Math.max(...values);
  const minRaw = Math.min(...values);
  const spread = Math.max(1e-9, maxRaw - minRaw);
  const maxV = maxRaw + spread * 0.07;
  const minV = minRaw - spread * 0.07;
  const range = maxV - minV;

  drawWatermark(ctx, width, 'leaf');
  drawGrid(ctx, { width, pad, graphW, graphH, minV, maxV, grid, text, muted, rows, axisFormatter: formatAxis });

  if (type === 'candles') drawCandles(ctx, rows, { pad, graphW, graphH, maxV, range });
  else drawLine(ctx, rows, { pad, graphW, graphH, maxV, range, blue, orange });

  return canvas.toBuffer('image/png');
}

function drawCompareChart({ first, second }) {
  const width = 2048;
  const height = 860;
  const pad = { left: 150, right: 84, top: 72, bottom: 92 };
  const graphW = width - pad.left - pad.right;
  const graphH = height - pad.top - pad.bottom;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const bg = '#111720';
  const grid = '#26374f';
  const text = '#b6bfd3';
  const muted = '#9ba6ba';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const firstRows = normalizeRows(first.rows);
  const secondRows = normalizeRows(second.rows);
  const values = firstRows.concat(secondRows).map(row => row[1]);
  const maxRaw = Math.max(...values);
  const minRaw = Math.min(...values);
  const spread = Math.max(0.2, maxRaw - minRaw);
  const maxV = maxRaw + spread * 0.14;
  const minV = minRaw - spread * 0.14;
  const range = maxV - minV;

  drawWatermark(ctx, width, 'leaf');
  drawGrid(ctx, { width, pad, graphW, graphH, minV, maxV, grid, text, muted, rows: first.rows, axisFormatter: formatPercentAxis });
  drawCompareLegend(ctx, [first, second], { pad, text });
  drawComparisonLine(ctx, firstRows, { pad, graphW, graphH, maxV, range, color: first.color });
  drawComparisonLine(ctx, secondRows, { pad, graphW, graphH, maxV, range, color: second.color });

  return canvas.toBuffer('image/png');
}

function normalizeRows(rows) {
  const start = Number(rows?.[0]?.[1] || 0) || 1;
  return rows.map(row => [row[0], ((Number(row[1]) / start) - 1) * 100]);
}

function drawCompareLegend(ctx, items, opts) {
  const { pad, text } = opts;
  ctx.save();
  ctx.font = '500 28px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let x = pad.left;
  const y = 34;
  for (const item of items) {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(x + 12, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = text;
    ctx.fillText(item.title, x + 32, y);
    x += Math.min(560, 96 + ctx.measureText(item.title).width);
  }
  ctx.restore();
}

function drawComparisonLine(ctx, rows, opts) {
  const { pad, graphW, graphH, maxV, range, color } = opts;
  const points = rows.map((row, i) => ({
    x: pad.left + (i / Math.max(1, rows.length - 1)) * graphW,
    y: pad.top + ((maxV - row[1]) / range) * graphH,
  }));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = `${color}55`;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.beginPath();
  points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const every = Math.max(1, Math.floor(points.length / 18));
  for (let i = 0; i < points.length; i++) {
    if (i !== 0 && i !== points.length - 1 && i % every !== 0) continue;
    const point = points[i];
    ctx.fillStyle = '#f3f7ff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const last = points[points.length - 1];
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrid(ctx, opts) {
  const { width, pad, graphW, graphH, minV, maxV, grid, text, muted, rows, axisFormatter = formatAxis } = opts;
  const steps = 6;
  const range = maxV - minV;

  ctx.save();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = grid;
  ctx.lineWidth = 2;
  ctx.font = '28px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = text;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= steps; i++) {
    const y = pad.top + (graphH / steps) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    const val = maxV - (range / steps) * i;
    ctx.fillText(axisFormatter(val), pad.left - 28, y);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = muted;
  ctx.font = '28px "Segoe UI", Arial, sans-serif';
  const verticals = 9;
  for (let i = 0; i <= verticals; i++) {
    const x = pad.left + (graphW / verticals) * i;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + graphH);
    ctx.stroke();

    const row = rows[Math.min(rows.length - 1, Math.round((rows.length - 1) * (i / verticals)))];
    const ts = Array.isArray(row) ? row[0] : Date.now();
    const label = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
    ctx.fillText(label, x, pad.top + graphH + 24);
  }
  ctx.restore();
}

function drawLine(ctx, rows, opts) {
  const { pad, graphW, graphH, maxV, range, blue, orange } = opts;
  const points = rows.map((row, i) => ({
    x: pad.left + (i / Math.max(1, rows.length - 1)) * graphW,
    y: pad.top + ((maxV - row[1]) / range) * graphH,
  }));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(77,140,255,0.35)';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = blue;
  ctx.lineWidth = 7;
  ctx.beginPath();
  points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const every = Math.max(1, Math.floor(points.length / 24));
  for (let i = 0; i < points.length; i++) {
    if (i !== 0 && i !== points.length - 1 && i % every !== 0) continue;
    const point = points[i];
    ctx.fillStyle = '#f3f7ff';
    ctx.strokeStyle = blue;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const last = points[points.length - 1];
  ctx.fillStyle = orange;
  ctx.strokeStyle = orange;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCandles(ctx, rows, opts) {
  const { pad, graphW, graphH, maxV, range } = opts;
  const candleW = Math.max(8, Math.min(28, Math.floor(graphW / rows.length) - 4));
  for (let i = 0; i < rows.length; i++) {
    const [, open, high, low, close] = rows[i];
    const x = pad.left + (i / Math.max(1, rows.length - 1)) * graphW;
    const yHigh = pad.top + ((maxV - high) / range) * graphH;
    const yLow = pad.top + ((maxV - low) / range) * graphH;
    const yOpen = pad.top + ((maxV - open) / range) * graphH;
    const yClose = pad.top + ((maxV - close) / range) * graphH;
    const up = close >= open;
    const color = up ? '#31d084' : '#ff5c73';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();
    const top = Math.min(yOpen, yClose);
    const h = Math.max(3, Math.abs(yClose - yOpen));
    roundRect(ctx, x - candleW / 2, top, candleW, h, 4);
    ctx.fill();
  }
}

function drawWatermark(ctx, width, text) {
  ctx.save();
  ctx.font = '500 44px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#b9c2d6';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(text, width - 86, 40);
  ctx.restore();
}

async function formatMarketStats(market, lang) {
  const price = Number(market.current_price || 0);
  const change = Number(market.price_change_24h || 0);
  const pct = Number(market.price_change_percentage_24h || 0);
  const high = Number(market.high_24h || 0);
  const low = Number(market.low_24h || 0);
  const emoji = change >= 0 ? '\u{1F4C8}' : '\u{1F4C9}';
  const [priceLabel, changeLabel, highLabel, lowLabel] = await Promise.all([
    translateText('Price', lang),
    translateText('24H Change', lang),
    translateText('24H High', lang),
    translateText('24H Low', lang),
  ]);
  return [
    `**${priceLabel}:** ${formatUsdNumber(price)} USD`,
    `**${changeLabel}:** ${formatSignedUsd(change)} (${formatSignedPercent(pct)}) ${emoji}`,
    `**${highLabel}:** ${formatUsdNumber(high)} USD`,
    `**${lowLabel}:** ${formatUsdNumber(low)} USD`,
  ].join('\n');
}

function tradingViewUrl(symbol) {
  const clean = String(symbol || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `https://www.tradingview.com/symbols/${clean}USD/`;
}

function coinTitle(market, fallback) {
  return `${market.name || capitalize(fallback)} (${String(market.symbol || fallback).toUpperCase()})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function capitalize(str) {
  return String(str || '').charAt(0).toUpperCase() + String(str || '').slice(1);
}

function formatAxis(num) {
  return Math.round(num).toLocaleString('en-US');
}

function formatPercentAxis(num) {
  const rounded = Number(num || 0).toFixed(Math.abs(num) >= 10 ? 1 : 2);
  return `${Number(rounded) > 0 ? '+' : ''}${rounded}%`;
}

function formatUsdNumber(num) {
  return Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSignedUsd(num) {
  const value = Number(num || 0);
  const sign = value > 0 ? '+' : '';
  return sign + formatUsdNumber(value);
}

function formatSignedPercent(num) {
  const value = Number(num || 0);
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatAbbrev(num) {
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const fmt = (n) => {
    if (n >= 1e12) return (n / 1e12).toFixed(n % 1e12 ? 2 : 0) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 ? 2 : 0) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 2 : 0) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'K';
    if (n === 0) return '0';
    if (n < 0.000001) return n.toExponential(2);
    return n.toPrecision(6).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  };
  return sign + fmt(abs);
}

function formatCurrencyAbbrev(num, currency = 'USD') {
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const unit = abbr => `${sign}$${abbr}`;
  if (abs >= 1e12) return unit((abs / 1e12).toFixed(2) + 'T');
  if (abs >= 1e9) return unit((abs / 1e9).toFixed(2) + 'B');
  if (abs >= 1e6) return unit((abs / 1e6).toFixed(2) + 'M');
  if (abs >= 1e3) return unit((abs / 1e3).toFixed(1) + 'K');
  return (sign ? '-' : '') + abs.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
