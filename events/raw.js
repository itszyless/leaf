const { sendInstallWelcome, sendInstallGoodbye } = require('../utils/welcomeInstallDm');
async function resolveUser(bot, payload) {
  const id = payload?.user?.id || payload?.user_id || payload?.userId || payload?.oauth2_install_params?.user_id;
  if (payload?.user?.id) return payload.user;
  if (!id) return null;
  try { return await bot.users.fetch(id); } catch { return { id }; }
}
module.exports = {
  name: 'raw',
  once: false,
  async execute(bot, packet) {
    const name = packet?.t || packet?.eventName;
    const data = packet?.d || packet?.data || {};
    if (name === 'APPLICATION_AUTHORIZED') {
      const user = await resolveUser(bot, data);
      if (user) await sendInstallWelcome(bot, user);
    }
    if (name === 'APPLICATION_DEAUTHORIZED') {
      const userId = data?.user?.id || data?.user_id || data?.userId;
      if (userId) await sendInstallGoodbye(bot, userId);
    }
  },
};
