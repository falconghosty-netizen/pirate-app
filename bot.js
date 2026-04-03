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

// ✅ CREATE CLIENT (this was missing)
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ✅ BOT READY
client.once(Events.ClientReady, () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

// ✅ BUTTON HANDLER
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    let status = "";
    let color = 0x5865F2;

    if (interaction.customId === "accept") {
      status = "✅ ACCEPTED";
      color = 0x57F287;
    }

    if (interaction.customId === "deny") {
      status = "❌ DENIED";
      color = 0xED4245;
    }

    const originalEmbed = interaction.message.embeds[0];

    // Get Discord ID
    const discordField = originalEmbed.fields.find(f => f.name === "Discord ID");
    const discordId = discordField?.value;

    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(color)
      .setFooter({ text: `Status: ${status} by ${interaction.user.username}` });

    const row = new ActionRowBuilder().addComponents(
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
      components: [row]
    });

    // 🎭 ROLE ONLY
    if (interaction.customId === "accept" && discordId && discordId !== "N/A") {
      try {
        const member = await interaction.guild.members.fetch(discordId);
        await member.roles.add(process.env.ROLE_ID);
      } catch (err) {
        console.error("Role assignment failed:", err);
      }
    }

  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "Error handling button", ephemeral: true });
  }
});

// ✅ LOGIN (must be last)
client.login(process.env.BOT_TOKEN);

module.exports = client;