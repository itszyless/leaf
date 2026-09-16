const fs = require('fs');
const path = require('path');
const { getUserEmbed } = require('./getUserEmbed');
const { abbreviate } = require('./abbreviate');
const { translateText } = require('./translator');
const { getUserLanguage } = require('./langStorage');
const file = path.join(__dirname, '..', 'data', 'lottery.json');
const ecoFile = path.join(__dirname, '..', 'data', 'economy.json');
const TICKET_COST = 1000;
const MAX_TICKETS = 10;
const ROUND_MS = 60 * 60 * 1000;
let timer = null;
function readJson(f, fb) { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8') || JSON.stringify(fb)) : fb; } catch { return fb; } }
function writeJson(f, data) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 2)); }
function defaultState() { return { round: 1, endsAt: Date.now() + ROUND_MS, tickets: {}, history: [] }; }
function state() { const s = readJson(file, defaultState()); if (!s.endsAt) s.endsAt = Date.now() + ROUND_MS; if (!s.tickets) s.tickets = {}; if (!Array.isArray(s.history)) s.history = []; return s; }
function saveState(s) { writeJson(file, s); }
function initEco(data, id) { if (!data[id]) data[id] = { cash: 0, bank: 0, joinedBonus: false, lastDaily: 0, lastBonus: 0, lastMonthlyPlus: 0 }; if (typeof data[id].cash !== 'number') data[id].cash = 0; if (typeof data[id].bank !== 'number') data[id].bank = 0; return data[id]; }
function status() { const s = state(); const entries = Object.entries(s.tickets).map(([userId, count]) => ({ userId, count: Number(count || 0) })).filter(x => x.count > 0); const totalTickets = entries.reduce((a,b)=>a+b.count,0); return { ...s, entries, totalTickets, prizePool: totalTickets * TICKET_COST, timeLeft: Math.max(0, s.endsAt - Date.now()) }; }
function buyTickets(userId, count) { count = Math.max(1, Math.min(MAX_TICKETS, Number(count || 1))); const s = state(); const current = Number(s.tickets[userId] || 0); const allowed = Math.max(0, MAX_TICKETS - current); const buying = Math.min(count, allowed); if (buying <= 0) return { ok: false, error: 'You already bought the maximum tickets for this round.', ...status() }; const eco = readJson(ecoFile, {}); const user = initEco(eco, userId); const cost = buying * TICKET_COST; if (user.cash < cost) return { ok: false, error: 'You do not have enough cash for those tickets.', ...status() }; user.cash -= cost; s.tickets[userId] = current + buying; writeJson(ecoFile, eco); saveState(s); return { ok: true, bought: buying, cost, ...status() }; }
function pickWinner(entries) { const total = entries.reduce((a,b)=>a+b.count,0); let roll = Math.random() * total; for (const e of entries) { roll -= e.count; if (roll <= 0) return e.userId; } return entries[0]?.userId || null; }
async function dm(bot, userId, won, prize, tickets, totalUsers, totalTickets) {
  try {
    const user = await bot.users.fetch(userId);
    const lang = getUserLanguage(userId) || 'en';
    const title = await translateText(won ? 'Lottery Winner' : 'Lottery Result', lang);
    const e = await getUserEmbed(userId, title);
    const prizeText = '**' + abbreviate(prize, 'prefix') + ' Cash**';
    const entriesLine = '**' + totalUsers + '** ' + await translateText('user(s)', lang) + ' / **' + totalTickets + '** ' + await translateText('ticket(s)', lang);
    if (won) {
      e.setDescription(
        (await translateText('You won the lottery round.', lang)) + '\n' +
        (await translateText('Final prize pool', lang)) + ': ' + prizeText + '\n' +
        (await translateText('Your winning tickets', lang)) + ': **' + tickets + '**\n' +
        (await translateText('Total entries', lang)) + ': ' + entriesLine + '\n' +
        (await translateText('The prize was deposited into your bank.', lang))
      );
    } else {
      e.setDescription(
        (await translateText('You lost this lottery round.', lang)) + '\n' +
        (await translateText('Final prize pool', lang)) + ': ' + prizeText + '\n' +
        (await translateText('Your tickets', lang)) + ': **' + tickets + '**\n' +
        (await translateText('Total entries', lang)) + ': ' + entriesLine
      );
    }
    await user.send({ embeds: [e] });
  } catch {}
}
async function finalize(bot) { const s = state(); const entries = Object.entries(s.tickets).map(([userId,count])=>({userId,count:Number(count||0)})).filter(x=>x.count>0); if (!entries.length) { s.round += 1; s.endsAt = Date.now() + ROUND_MS; s.tickets = {}; saveState(s); return null; } const winner = pickWinner(entries); const prize = entries.reduce((a,b)=>a+b.count,0) * TICKET_COST; const eco = readJson(ecoFile, {}); const row = initEco(eco, winner); row.bank += prize; writeJson(ecoFile, eco); for (const e of entries) await dm(bot, e.userId, e.userId === winner, prize, e.count, entries.length, entries.reduce((a,b)=>a+b.count,0)); s.history.unshift({ round: s.round, winner, prize, entries, endedAt: Date.now() }); s.history = s.history.slice(0, 25); s.round += 1; s.endsAt = Date.now() + ROUND_MS; s.tickets = {}; saveState(s); return { winner, prize }; }
function runLottery(bot) { if (timer) clearInterval(timer); const tick = async () => { const s = state(); if (Date.now() >= s.endsAt) await finalize(bot).catch(err => console.error('Lottery finalize error:', err?.message || err)); }; timer = setInterval(tick, 30000); tick(); }
module.exports = { TICKET_COST, MAX_TICKETS, ROUND_MS, initLottery: runLottery, runLottery, buyTickets, status, finalize };
