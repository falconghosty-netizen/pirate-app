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

    // Update embed
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(color)
      .setFooter({
        text: `Status: ${status} by ${interaction.user.username}`
      });

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
      console.log("Application accepted.");
    } else {
      console.log("Application denied.");
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