const fs = require('fs');
const path = require('path');
const ecoPath = path.join(__dirname, '../data/economy.json');
const lotteryPath = path.join(__dirname, '../data/lottery.json');
const plusPath = path.join(__dirname, '../data/plusUsers.json');

function drawLottery() {
  const ecoData = fs.existsSync(ecoPath) ? JSON.parse(fs.readFileSync(ecoPath, 'utf8')) : {};
  const plusData = fs.existsSync(plusPath) ? JSON.parse(fs.readFileSync(plusPath, 'utf8')) : {};
  const lotteryData = fs.existsSync(lotteryPath) ? JSON.parse(fs.readFileSync(lotteryPath, 'utf8')) : {};
  const current = lotteryData.current || { tickets: {}, jackpot: 0 };

  const entries = [];
  for (const [id, amount] of Object.entries(current.tickets)) {
    const weight = plusData[id] ? 2 : 1;
    for (let i = 0; i < amount * weight; i++) {
      entries.push(id);
    }
  }

  if (entries.length === 0) return;

  const winnerId = entries[Math.floor(Math.random() * entries.length)];
  if (!ecoData[winnerId]) ecoData[winnerId] = { coins: 0, bank: 0 };
  ecoData[winnerId].coins += current.jackpot;

  // DM users
  for (const userId of Object.keys(current.tickets)) {
    const member = global.client?.users?.cache?.get(userId);
    if (member) {
      if (userId === winnerId) {
        member.send(`🎉 You won the lottery and got ${current.jackpot.toLocaleString('en-US')} coins!`).catch(() => {});
      } else {
        member.send(`😢 You didn't win the lottery this time. Better luck next round!`).catch(() => {});
      }
    }
  }

  // Reset
  lotteryData.current = { tickets: {}, jackpot: 0 };
  fs.writeFileSync(lotteryPath, JSON.stringify(lotteryData, null, 2));
  fs.writeFileSync(ecoPath, JSON.stringify(ecoData, null, 2));
}

function startLotteryInterval() {
  setInterval(() => {
    drawLottery();
  }, 10 * 60 * 1000); // every 10 minutes
}

module.exports = { drawLottery, startLotteryInterval };