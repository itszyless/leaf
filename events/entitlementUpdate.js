const {
  grantPlus,
  removePlus,
  getPlusInfo,
  plusSkuKind,
  entitlementUserId,
  entitlementEndsAt,
} = require('../utils/plusAccess');

module.exports = {
  name: 'entitlementUpdate',
  once: false,

  async execute(bot, oldEntitlement, newEntitlement) {
    const entitlement = newEntitlement || oldEntitlement;
    const kind = plusSkuKind(entitlement?.skuId);
    const userId = entitlementUserId(entitlement);
    if (!kind || !userId) return;

    if (entitlement?.deleted) {
      if (kind === 'monthly') {
        const info = getPlusInfo(userId);
        const matchingMonthly = info.expiration?.source === 'discord_sku_monthly'
          && (!info.expiration.entitlementId || info.expiration.entitlementId === entitlement.id);
        if (!matchingMonthly) return;
      }
      removePlus(userId);
      return;
    }

    const endsAt = kind === 'monthly' ? entitlementEndsAt(entitlement) : null;
    grantPlus(userId, {
      source: `discord_sku_${kind}`,
      label: kind === 'monthly' ? 'Discord monthly' : 'Discord lifetime',
      skuId: entitlement.skuId,
      entitlementId: entitlement.id,
      expiresAt: endsAt || undefined,
    });
  },
};
