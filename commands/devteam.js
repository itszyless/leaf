const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const { getUserLanguage } = require("../utils/langStorage");
const { translateText } = require("../utils/translator");
const { getUserEmbed } = require("../utils/getUserEmbed");
const config = require("../config.json");

const team = [
  {
    name: "Zyless",
    roleKey: "Founder & Lead Developer",
    discordId: config.Owner_ID,
    socials: {
      Discord: "@zyl.ss",
      Twitter: "https://x.com/itszyless",
    },
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("devteam")
    .setDescription("View the leaf development team."),
  category: "Utility",

  async execute(interaction) {
    const lang = getUserLanguage(interaction.user.id) || "en";

    try {
      const width = 1000;
      const memberHeight = 210;
      const margin = 40;
      const headerHeight = 120;
      const footerHeight = 60;
      const cardRadius = 35;
      const totalHeight =
        headerHeight + team.length * (memberHeight + margin) + footerHeight;

      const canvas = createCanvas(width, totalHeight);
      const ctx = canvas.getContext("2d");

      // Rounded corners background
      const outerRadius = 40;
      ctx.beginPath();
      ctx.moveTo(outerRadius, 0);
      ctx.lineTo(width - outerRadius, 0);
      ctx.quadraticCurveTo(width, 0, width, outerRadius);
      ctx.lineTo(width, totalHeight - outerRadius);
      ctx.quadraticCurveTo(
        width,
        totalHeight,
        width - outerRadius,
        totalHeight,
      );
      ctx.lineTo(outerRadius, totalHeight);
      ctx.quadraticCurveTo(0, totalHeight, 0, totalHeight - outerRadius);
      ctx.lineTo(0, outerRadius);
      ctx.quadraticCurveTo(0, 0, outerRadius, 0);
      ctx.closePath();
      ctx.clip();

      // Background
      ctx.fillStyle = "#090909";
      ctx.fillRect(0, 0, width, totalHeight);

      const gridSize = 40;
      ctx.strokeStyle = "rgba(215, 114, 209, 0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, totalHeight);
        ctx.stroke();
      }
      for (let y = 0; y < totalHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Header
      ctx.textAlign = "center";
      ctx.font = "bold 56px Sans";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#72a6d788";
      ctx.shadowBlur = 25;
      ctx.fillText("leaf Development Team", width / 2, 85);
      ctx.shadowBlur = 0;

      // Member cards
      let y = headerHeight;
      for (const member of team) {
        // Fetch user from Discord API (works even if not cached)
        const user = await interaction.client.users
          .fetch(member.discordId)
          .catch(() => null);

        // Fallback if user not found
        let avatarURL;
        if (user) {
          avatarURL = user.displayAvatarURL({
            size: 512,
            extension: "png",
            forceStatic: false,
          });
        } else {
          // default avatar (Discord's built-in)
          const defaultIndex = Number(BigInt(member.discordId) >> 22n) % 6;
          avatarURL = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
        }

        const avatar = await loadImage(avatarURL).catch(() => null);

        const cardX = 60;
        const cardW = width - 120;

        // Card background
        const cardGradient = ctx.createLinearGradient(
          cardX,
          y,
          cardX + cardW,
          y + memberHeight,
        );
        cardGradient.addColorStop(0, "rgba(25, 25, 35, 0.95)");
        cardGradient.addColorStop(1, "rgba(15, 15, 25, 0.95)");
        ctx.fillStyle = cardGradient;
        ctx.beginPath();
        ctx.roundRect(cardX, y, cardW, memberHeight, cardRadius);
        ctx.fill();

        // Border
        ctx.strokeStyle = "rgba(114, 158, 215, 0.4)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Avatar + glow
        if (avatar) {
          const avatarRadius = 70;
          const avatarCenterX = cardX + 120;
          const avatarCenterY = y + memberHeight / 2;

          ctx.save();
          ctx.beginPath();
          ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(
            avatar,
            avatarCenterX - avatarRadius,
            avatarCenterY - avatarRadius,
            avatarRadius * 2,
            avatarRadius * 2,
          );
          ctx.restore();

          ctx.beginPath();
          ctx.arc(
            avatarCenterX,
            avatarCenterY,
            avatarRadius + 2,
            0,
            Math.PI * 2,
          );
          ctx.strokeStyle = "rgba(114, 149, 215, 0.8)";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#7295d755";
          ctx.shadowBlur = 12;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Text
        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 38px Sans";
        ctx.fillText(member.name, cardX + 250, y + 80);

        ctx.fillStyle = "#72a6d7";
        ctx.font = "26px Sans";
        ctx.fillText(
          await translateText(member.roleKey, lang),
          cardX + 250,
          y + 115,
        );

        // Socials
        let socialY = y + 145;
        ctx.font = "21px Sans";
        for (const [key, value] of Object.entries(member.socials)) {
          ctx.fillStyle = "#86a6ff";
          ctx.fillText(`${key}:`, cardX + 250, socialY);
          ctx.fillStyle = "#e0e0e0";
          ctx.fillText(value, cardX + 330, socialY);
          socialY += 26;
        }

        y += memberHeight + margin;
      }

      // Footer
      ctx.textAlign = "right";
      ctx.font = "bold 22px Sans";
      ctx.fillStyle = "#728dd7";
      ctx.fillText("leaf Team", width - 45, totalHeight - 25);

      // Output
      const buffer = canvas.toBuffer("image/png");
      const file = new AttachmentBuilder(buffer, { name: "leaf-team.png" });

      const embed = await getUserEmbed(interaction.user.id, "leaf Team");
      embed
        .setTitle("leaf Development Team")
        .setDescription(
          await translateText("Meet the people behind leaf.", lang),
        )
        .setImage("attachment://leaf-team.png");

      await interaction.editReply({ embeds: [embed], files: [file] });
    } catch (err) {
      console.error("Devteam error:", err);
      const e = await getUserEmbed(interaction.user.id, null, "error");
      e.setDescription(
        await translateText(
          "Something went wrong while generating the team card.",
          lang,
        ),
      );
      await interaction.editReply({ embeds: [e], ephemeral: true });
    }
  },
};

