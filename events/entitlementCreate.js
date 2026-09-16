const {
  grantPlus,
  plusSkuKind,
  entitlementUserId,
  entitlementEndsAt,
} = require('../utils/plusAccess');

module.exports = {
  name: 'entitlementCreate',
  once: false,

  async execute(bot, entitlement) {
    const kind = plusSkuKind(entitlement?.skuId);
    const userId = entitlementUserId(entitlement);
    if (!kind || !userId) return;

    const endsAt = kind === 'monthly' ? entitlementEndsAt(entitlement) : null;
    grantPlus(userId, {
      source: `discord_sku_${kind}`,
      label: kind === 'monthly' ? 'Discord monthly' : 'Discord lifetime',
      skuId: entitlement.skuId,
      entitlementId: entitlement.id,
      expiresAt: endsAt || undefined,
    });

    const user = await bot.users.fetch(userId).catch(() => null);
    if (user) {
      user.send(`Thanks for purchasing **leaf Plus**. Your Plus perks are active now${endsAt ? ` until <t:${Math.floor(endsAt / 1000)}:f>` : ''}.`).catch(() => null);
    }
  },
};
