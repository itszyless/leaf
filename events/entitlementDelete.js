const {
  removePlus,
  getPlusInfo,
  plusSkuKind,
  entitlementUserId,
} = require('../utils/plusAccess');

module.exports = {
  name: 'entitlementDelete',
  once: false,

  async execute(bot, entitlement) {
    const kind = plusSkuKind(entitlement?.skuId);
    const userId = entitlementUserId(entitlement);
    if (!kind || !userId) return;

    if (kind === 'monthly') {
      const info = getPlusInfo(userId);
      const matchingMonthly = info.expiration?.source === 'discord_sku_monthly'
        && (!info.expiration.entitlementId || info.expiration.entitlementId === entitlement.id);
      if (!matchingMonthly) return;
    }

    removePlus(userId);
    const user = await bot.users.fetch(userId).catch(() => null);
    if (user) user.send('Your **leaf Plus** subscription ended, so Plus perks were removed.').catch(() => null);
  },
};
