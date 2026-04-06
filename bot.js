const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
require("dotenv").config();

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// ===== READY =====
client.once(Events.ClientReady, () => {
  console.log(`Bot logged in as ${client.user.username}`);
});

// ===== BUTTON HANDLER =====
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    const originalEmbed = interaction.message.embeds[0];
    if (!originalEmbed) return;

    let status = "";
    let color = 0x5865F2;

    if (interaction.customId === "accept") {
      status = "✅ ACCEPTED";
      color = 0x57F287;
    } else if (interaction.customId === "deny") {
      status = "❌ DENIED";
      color = 0xED4245;
    } else {
      return;
    }

    // Parse hidden field (zero-width space name) for real IGN + Discord
    const hiddenField = originalEmbed.fields.find(f => f.name === "\u200b");
    let realIgn = "N/A";
    let realDiscord = "N/A";

    if (hiddenField) {
      const parts = hiddenField.value.split("|||");
      realIgn = parts[0] || "N/A";
      realDiscord = parts[1] || "N/A";
    }

    // Rebuild embed with revealed IGN + Discord, drop the hidden field
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(color)
      .setFooter({ text: `Status: ${status} by ${interaction.user.username}` })
      .spliceFields(0, 1, { name: "Minecraft IGN", value: realIgn })
      .spliceFields(1, 1, { name: "Discord", value: realDiscord })
      .spliceFields(5, 1); // remove the hidden storage field

    // Disable buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("accept")
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("deny")
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    await interaction.update({
      embeds: [updatedEmbed],
      components: [row]
    });

    if (interaction.customId === "accept") {
      console.log(`Application accepted. IGN: ${realIgn} | Discord: ${realDiscord}`);
    } else {
      console.log(`Application denied. IGN: ${realIgn} | Discord: ${realDiscord}`);
    }

  } catch (err) {
    console.error("Interaction error:", err);
    if (!interaction.replied) {
      await interaction.reply({
        content: "Error handling this interaction.",
        ephemeral: true
      });
    }
  }
});

// ===== LOGIN =====
client.login(process.env.BOT_TOKEN);
module.exports = client;
