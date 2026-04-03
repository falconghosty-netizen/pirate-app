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

    const { EmbedBuilder } = require("discord.js");

    const originalEmbed = interaction.message.embeds[0];

    // Get Discord ID from embed
    const discordField = originalEmbed.fields.find(f => f.name === "Discord ID");
    const discordId = discordField?.value;

    // Update embed
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(color)
      .setFooter({ text: `Status: ${status} by ${interaction.user.username}` });

    // Disable buttons
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

    // 🎭 GIVE ROLE ONLY ON ACCEPT
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