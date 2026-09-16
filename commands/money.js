const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
const ecoPath = path.join(__dirname, "../data/economy.json");

const { getUserEmbed } = require("../utils/getUserEmbed");
const { getUserLanguage } = require("../utils/langStorage");
const { translateText } = require("../utils/translator");
const { abbreviate } = require("../utils/abbreviate");

function initUser(data, id) {
  if (!data[id]) {
    data[id] = {
      cash: 0,
      bank: 0,
      lastWork: 0,
      lastDaily: 0,
      lastBeg: 0,
      upgrades: [],
      passive: { sources: [], lastPayout: 0 },
    };
  }
  return data[id];
}

function save(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("money")
    .setDescription("Admin money controls")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // ─────── GIVE ───────
    .addSubcommand((sub) =>
      sub
        .setName("give")
        .setDescription("Give a user money")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Target user").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Amount to give")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("place")
            .setDescription("Where to give the money")
            .addChoices(
              { name: "Wallet", value: "wallet" },
              { name: "Bank", value: "bank" },
            ),
        ),
    )

    // ─────── REMOVE ───────
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove money from a user")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Target user").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Amount to remove")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("place")
            .setDescription("Where to remove the money from")
            .addChoices(
              { name: "Wallet", value: "wallet" },
              { name: "Bank", value: "bank" },
            ),
        ),
    )

    // ─────── SET ───────
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set user money balance")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Target user").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName("amount").setDescription("New amount").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("place")
            .setDescription("Where to set the amount")
            .addChoices(
              { name: "Wallet", value: "wallet" },
              { name: "Bank", value: "bank" },
            ),
        ),
    )

    // ─────── RESET ───────
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Reset a user's wallet and/or bank")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Target user").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("place")
            .setDescription("Choose what to reset")
            .addChoices(
              { name: "Wallet only", value: "wallet" },
              { name: "Bank only", value: "bank" },
              { name: "Both", value: "both" },
            ),
        ),
    ),
  category: "Admin",
  hidden: true,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const place = interaction.options.getString("place");
    const adminId = interaction.user.id;

    const lang = getUserLanguage(adminId) || "en";
    const currency = "Cash";

    if (!fs.existsSync(ecoPath)) fs.writeFileSync(ecoPath, "{}");
    const data = JSON.parse(fs.readFileSync(ecoPath, "utf8"));
    const userData = initUser(data, user.id);

    const e = await getUserEmbed(adminId, "Money Control");

    // helper to select correct field
    const targetField = place === "bank" ? "bank" : "cash";
    const placeName = place === "bank" ? "bank" : "wallet";

    // ─────── GIVE ───────
    if (sub === "give") {
      if (amount <= 0) {
        e.setDescription(
          await translateText("Amount must be greater than zero.", lang),
        );
        return interaction.editReply({ embeds: [e] });
      }
      userData[targetField] += amount;
      save(ecoPath, data);
      const p1 = await translateText("Gave", lang);
      const p2 = await translateText("to", lang);
      const p3 = await translateText("New", lang);
      const p4 = await translateText("balance", lang);
      e.setDescription(
        `${p1} **${abbreviate(amount, "prefix")} ${currency}** ${p2} **${user.username}**'s ${placeName}.\n${p3} ${placeName} ${p4}: **${abbreviate(userData[targetField], "prefix")} ${currency}**.`,
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ─────── REMOVE ───────
    if (sub === "remove") {
      if (amount <= 0) {
        e.setDescription(
          await translateText("Amount must be greater than zero.", lang),
        );
        return interaction.editReply({ embeds: [e] });
      }
      userData[targetField] = Math.max(0, userData[targetField] - amount);
      save(ecoPath, data);
      const p1 = await translateText("Removed", lang);
      const p2 = await translateText("from", lang);
      const p3 = await translateText("New", lang);
      const p4 = await translateText("balance", lang);
      e.setDescription(
        await translateText(
          `${p1} **${abbreviate(amount, "prefix")} ${currency}** ${p2} **${user.username}**'s ${placeName}.\n${p3} ${placeName} ${p4}: **${abbreviate(userData[targetField], "prefix")} ${currency}**.`,
          lang,
        ),
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ─────── SET ───────
    if (sub === "set") {
      if (amount < 0) {
        e.setDescription(
          await translateText("Amount cannot be negative.", lang),
        );
        return interaction.editReply({ embeds: [e] });
      }
      userData[targetField] = amount;
      save(ecoPath, data);
      const p1 = await translateText("Set", lang);
      const p2 = await translateText("to", lang);
      e.setDescription(
        await translateText(
          `${p1} **${user.username}**'s ${placeName} ${p2} **${abbreviate(amount, "prefix")} ${currency}**.`,
          lang,
        ),
      );
      return interaction.editReply({ embeds: [e] });
    }

    // ─────── RESET ───────
    if (sub === "reset") {
      const mode = place || "both";

      if (mode === "wallet") {
        userData.cash = 0;
      } else if (mode === "bank") {
        userData.bank = 0;
      } else {
        userData.cash = 0;
        userData.bank = 0;
      }

      save(ecoPath, data);

      const msg =
        mode === "wallet"
          ? `Reset **${user.username}**'s wallet to 0`
          : mode === "bank"
            ? `Reset **${user.username}**'s bank to 0`
            : `Reset **${user.username}**'s wallet and bank to 0`;

      e.setDescription((await translateText(msg, lang)) + " " + currency + ".");
      return interaction.editReply({ embeds: [e] });
    }
  },
};
