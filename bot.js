const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// When bot starts
client.once(Events.ClientReady, () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

// Handle button clicks
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "accept") {
    await interaction.reply({ content: "✅ Application accepted!", ephemeral: true });
  }

  if (interaction.customId === "deny") {
    await interaction.reply({ content: "❌ Application denied!", ephemeral: true });
  }
});


// 👇 THIS MUST BE AT THE VERY BOTTOM
client.login(process.env.BOT_TOKEN);

module.exports = client;