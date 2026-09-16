const { sendInstallWelcome } = require('../utils/welcomeInstallDm');

async function findAuthorizedUser(bot, event) {
  const direct = event?.user || event?.authorizingUser || event?.data?.user;
  if (direct?.id) return direct;

  const owners = event?.authorizingIntegrationOwners || event?.data?.authorizing_integration_owners || event?.authorizing_integration_owners;
  const userId = owners?.['1'] || owners?.[1] || event?.userId || event?.user_id;
  if (userId) return bot.users.fetch(userId, { force: true }).catch(() => null);
  return null;
}

module.exports = {
  name: 'applicationAuthorized',
  once: false,

  async execute(bot, event) {
    const user = await findAuthorizedUser(bot, event);
    if (user) await sendInstallWelcome(bot, user, 'applicationAuthorized');
  },
};
