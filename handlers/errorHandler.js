const { EmbedBuilder, WebhookClient } = require("discord.js");
const config = require("../config.json");

const webhook = config.Webhook_Error ? new WebhookClient({ url: config.Webhook_Error }) : null;

function reportError(error, type = "Unknown") {
  console.error(type + ":", error);

  const embed = new EmbedBuilder()
    .setTitle(`🚨 New Error: ${type}`)
    .setColor(config.Embed_Error_Color || 0xff0000)
    .addFields(
      { name: "Type", value: `\`${type}\`` },
      {
        name: "Error Name",
        value: `\`${error?.name || "N/A"}\``,
        inline: true,
      },
      { name: "Message", value: `\`\`\`${error?.message || error}\`\`\`` },
      {
        name: "Time",
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: true,
      },
    )
    .setTimestamp();

  if (error?.stack) {
    const trimmedStack =
      error.stack.length > 1000
        ? error.stack.slice(0, 1000) + "... (truncated)"
        : error.stack;
    embed.addFields({
      name: "Stack Trace",
      value: `\`\`\`${trimmedStack}\`\`\``,
    });
  }

  webhook?.send({
      username: `leaf ${config["Arrow-Icon"]} Error Handler`,
      embeds: [embed],
    })
    .catch(() => {});
}

function initErrorHooks() {
  process.on("uncaughtException", (err) => {
    reportError(err, "Uncaught Exception");
  });

  process.on("unhandledRejection", (reason) => {
    reportError(reason, "Unhandled Rejection");
  });
}

module.exports = { initErrorHooks, reportError };
