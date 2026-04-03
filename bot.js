const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  Events,
  EmbedBuilder 
} = require("discord.js");

require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// When bot starts
client.once(Events.ClientReady, () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

// Handle button clicks
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    let status = "";
    let color = 0x5865F2;

    if (interaction.customId === "accept") {
      status = "✅ ACCEPTED";
      color = 0x57F287; // green
    }

    if (interaction.customId === "deny") {
      status = "❌ DENIED";
      color = 0xED4245; // red
    }

    // Get original embed
    const originalEmbed = interaction.message.embeds[0];

    // Rebuild embed (important — embeds are immutable)
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(color)
      .setFooter({ text: `Status: ${status}` });

    // Disable buttons
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("accept")
        .setLabel("Accepted")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),

      new ButtonBuilder()
        .setCustomId("deny")
        .setLabel("Denied")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    await interaction.update({
      embeds: [updatedEmbed],
      components: [disabledRow]
    });

  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "Error handling button", ephemeral: true });
  }
});

// 👇 MUST be last
client.login(process.env.BOT_TOKEN);

module.exports = client;