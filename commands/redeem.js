const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("../config.json");
const { getUserLanguage } = require("../utils/langStorage");
const { translateText } = require("../utils/translator");
const { getUserEmbed } = require("../utils/getUserEmbed");
const { grantPlus, isPlusActive } = require("../utils/plusAccess");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Plus keys only. Basic is now the free/default feature set.
const plusKeyPath = path.join(__dirname, "../data/plus_keys.json");

// Load/save helpers
function load(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function sendRedeemWebhook(user, plan, key) {
  if (!config.Webhook_Redeem) return;

  await fetch(config.Webhook_Redeem, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "leaf " + config["Arrow-Icon"] + " Redeemed Key",
      embeds: [
        {
          title: "Key Redeemed",
          color: parseInt(config.Embed_Color.replace("#", ""), 16),
          fields: [
            {
              name: "Plan",
              value: `\`${plan.charAt(0).toUpperCase() + plan.slice(1)}\``,
              inline: false,
            },
            {
              name: "User",
              value: `${user.tag} (\`${user.id}\`)`,
              inline: false,
            },
            { name: "Used Key", value: `\`${key}\``, inline: false },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("redeem")
    .setDescription("Redeem a Plus key")
    .addSubcommand((sub) =>
      sub
        .setName("plus")
        .setDescription("Redeem a plus key")
        .addStringOption((opt) =>
          opt
            .setName("key")
            .setDescription("Your plus key")
            .setRequired(true),
        ),
    ),

  category: "Utility",

  async execute(interaction) {
    const keyInput = interaction.options.getString("key");
    const userLang = getUserLanguage(interaction.user.id) || "en";

    const plan = "plus";
    const keyData = load(plusKeyPath, []);

    if (isPlusActive(interaction.user.id)) {
      const msg = await translateText(
        "You already have Plus access.",
        userLang,
      );
      const embed = await getUserEmbed(interaction.user.id, null, "error");
      embed.setDescription(msg);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    const keyObj = keyData.find((k) => k.key === keyInput);
    if (!keyObj || keyObj.used) {
      const msg = await translateText(
        `This ${plan} key is invalid or has already been used.`,
        userLang,
      );
      const embed = await getUserEmbed(interaction.user.id, null, "error");
      embed.setDescription(msg);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    keyObj.used = true;
    grantPlus(interaction.user.id, { source: "redeem_key", label: "Plus key" });
    save(plusKeyPath, keyData);

    await sendRedeemWebhook(interaction.user, plan, keyInput);

    const success = await translateText(
      "You successfully redeemed a Plus key.",
      userLang,
    );
    const title = await translateText(
      "Plus Unlocked",
      userLang,
    );

    const embed = await getUserEmbed(interaction.user.id, "Redeem");
    embed.setTitle(`${title}`);
    embed.setDescription(success);

    return interaction.editReply({ embeds: [embed], ephemeral: true });
  },
};


