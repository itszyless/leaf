const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas } = require("canvas");
const config = require("../config.json");
const { getUserLanguage } = require("../utils/langStorage");
const { translateText } = require("../utils/translator");
const { getUserEmbed } = require("../utils/getUserEmbed");
const path = require("path");
const fs = require("fs");

function hexToRgb(hex) {
  const n = parseInt(hex, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) h = s = 0;
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("color")
    .setDescription(
      "Show a detailed color preview from a HEX code (e.g. #ff9900)"
    )
    .addStringOption((opt) =>
      opt
        .setName("hex")
        .setDescription("Color hex code (e.g. #00ffcc)")
        .setRequired(true)
    ),
  category: "Image",

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || "en";
    const input = interaction.options.getString("hex").trim();
    const hex = input.replace("#", "").toLowerCase();

    if (!/^([0-9a-f]{6})$/i.test(hex)) {
      const error = await getUserEmbed(interaction.user.id, null, "error");
      error.setDescription(
        await translateText("Please enter a valid hex code like #00ffcc.", lang)
      );
      return interaction.editReply({ embeds: [error] });
    }

    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);

    // Generate color preview using Canvas
    const width = 600,
      height = 200;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `#${hex}`;
    ctx.fillRect(0, 0, width, height);

    // Add text contrast automatically
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    ctx.fillStyle = brightness > 150 ? "#00000099" : "#ffffffaa";
    ctx.font = "28px Sans";
    ctx.textAlign = "center";
    ctx.fillText(`#${hex.toUpperCase()}`, width / 2, height / 2 + 10);

    const buffer = canvas.toBuffer("image/png");
    const attachment = new AttachmentBuilder(buffer, { name: "color.png" });

    const title = await translateText("Color Preview", lang);
    const embed = await getUserEmbed(interaction.user.id, "Color Preview");

    embed
      .setTitle(`🎨 ${title}: #${hex.toUpperCase()}`)
      .setImage("attachment://color.png")
      .setDescription(
        `**HEX:** \`#${hex.toUpperCase()}\`\n` +
          `**RGB:** \`${r}, ${g}, ${b}\`\n` +
          `**HSL:** \`${h}, ${s}%, ${l}%\`\n` +
          `**Brightness:** \`${Math.round(brightness)}\``
      );

    await interaction.editReply({ embeds: [embed], files: [attachment] });
  },
};
