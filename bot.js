const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, SlashCommandBuilder, REST, Routes
} = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// { ign, discord, userId, fields, scores: Map<staffId, score> }
const applicationData = new Map();

// ===== READY =====
client.once(Events.ClientReady, async () => {
  console.log(`Bot logged in as ${client.user.username}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("sort")
      .setDescription("Sort all rated applications by average score and post results")
      .toJSON(),
    new SlashCommandBuilder()
      .setName("clearapps")
      .setDescription("Clear all stored applications from memory")
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
});

// ===== SEND APPLICATION (called from server.js) =====
async function sendApplication({ ign, discord, userId, fields, channelId }) {
  const channel = await client.channels.fetch(channelId);

  const embed = new EmbedBuilder()
    .setTitle("📥 New Application")
    .setColor(0x5865F2)
    .addFields(
      { name: "Minecraft IGN", value: "[hidden]", inline: true },
      { name: "Discord", value: "[hidden]", inline: true },
      ...fields
    );

  const message = await channel.send({ embeds: [embed] });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rate_${message.id}`)
      .setLabel("Rate")
      .setStyle(ButtonStyle.Primary)
  );

  await message.edit({ components: [row] });

  applicationData.set(message.id, {
    ign, discord, userId, fields, scores: new Map()
  });
}

// ===== INTERACTIONS =====
client.on(Events.InteractionCreate, async (interaction) => {

  // ── RATE BUTTON ──
  if (interaction.isButton() && interaction.customId.startsWith("rate_")) {
    const messageId = interaction.customId.replace("rate_", "");

    const modal = new ModalBuilder()
      .setCustomId(`rateModal_${messageId}`)
      .setTitle("Rate Application");

    const scoreInput = new TextInputBuilder()
      .setCustomId("score")
      .setLabel("Score (1-10)")
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(2)
      .setPlaceholder("Enter a number from 1 to 10")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(scoreInput));
    await interaction.showModal(modal);
    return;
  }

  // ── RATE MODAL SUBMIT ──
  if (interaction.isModalSubmit() && interaction.customId.startsWith("rateModal_")) {
    const messageId = interaction.customId.replace("rateModal_", "");
    const score = parseInt(interaction.fields.getTextInputValue("score"));

    if (isNaN(score) || score < 1 || score > 10) {
      await interaction.reply({
        content: "Invalid score. Please enter a number between 1 and 10.",
        ephemeral: true
      });
      return;
    }

    const data = applicationData.get(messageId);
    if (!data) {
      await interaction.reply({ content: "Could not find this application.", ephemeral: true });
      return;
    }

    const alreadyRated = data.scores.has(interaction.user.id);
    data.scores.set(interaction.user.id, score);

    await interaction.reply({
      content: alreadyRated
        ? `Updated your score to **${score}/10**.`
        : `Rated **${score}/10**. Thanks!`,
      ephemeral: true
    });
    return;
  }

  // ── ACCEPT / DENY (in sort results channel) ──
  if (interaction.isButton() &&
    (interaction.customId.startsWith("accept_") || interaction.customId.startsWith("deny_"))) {
    try {
      const [action, messageId] = interaction.customId.split("_");
      const originalEmbed = interaction.message.embeds[0];
      if (!originalEmbed) return;

      const isAccept = action === "accept";
      const color = isAccept ? 0x57F287 : 0xED4245;
      const status = isAccept ? "✅ ACCEPTED" : "❌ DENIED";

      const data = applicationData.get(messageId);
      const realIgn = data?.ign || "N/A";
      const realDiscord = data?.discord || "N/A";
      const userId = data?.userId;

      const updatedEmbed = EmbedBuilder.from(originalEmbed)
        .setColor(color)
        .setFooter({ text: `${status} by ${interaction.user.username}` })
        .spliceFields(0, 1, { name: "Minecraft IGN", value: realIgn, inline: true })
        .spliceFields(1, 1, { name: "Discord", value: realDiscord, inline: true });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_${messageId}`)
          .setLabel("Accept")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`deny_${messageId}`)
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );

      await interaction.update({ embeds: [updatedEmbed], components: [row] });

      if (isAccept && userId) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          await member.roles.add("1490830950697930892");
          console.log(`Role assigned to ${realDiscord} (${userId})`);
        } catch (roleErr) {
          console.error("Failed to assign role:", roleErr);
        }
      }

      console.log(`Application ${action}ed. IGN: ${realIgn} | Discord: ${realDiscord}`);
    } catch (err) {
      console.error("Accept/Deny error:", err);
      if (!interaction.replied)
        await interaction.reply({ content: "Error handling this interaction.", ephemeral: true });
    }
    return;
  }

  // ── /sort COMMAND ──
  if (interaction.isChatInputCommand() && interaction.commandName === "sort") {
    await interaction.deferReply({ ephemeral: true });

    try {
      if (!applicationData.size) {
        await interaction.editReply("No applications found.");
        return;
      }

      const resultsChannel = await client.channels.fetch(process.env.SORT_CHANNEL_ID);

      const sorted = [];
      for (const [messageId, data] of applicationData.entries()) {
        const scores = [...data.scores.values()];
        const avg = scores.length
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;
        sorted.push({ messageId, data, avg, count: scores.length });
      }
      sorted.sort((a, b) => b.avg - a.avg);

      await resultsChannel.send({
        content: `# 📊 Sorted Applications — ${sorted.length} total\nHighest to lowest average score.`
      });

      for (let i = 0; i < sorted.length; i++) {
        const { messageId, data, avg, count } = sorted[i];

        const embed = new EmbedBuilder()
          .setTitle(`#${i + 1} — Application`)
          .setColor(0x5865F2)
          .addFields(
            { name: "Minecraft IGN", value: "[hidden]", inline: true },
            { name: "Discord", value: "[hidden]", inline: true },
            {
              name: "⭐ Avg Score",
              value: `**${avg.toFixed(1)}/10** (${count} rating${count !== 1 ? "s" : ""})`,
              inline: true
            },
            ...data.fields
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`accept_${messageId}`)
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`deny_${messageId}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
        );

        await resultsChannel.send({ embeds: [embed], components: [row] });
      }

      await interaction.editReply(
        `Done! ${sorted.length} applications posted in <#${process.env.SORT_CHANNEL_ID}>.`
      );
    } catch (err) {
      console.error("/sort error:", err);
      await interaction.editReply("Something went wrong running /sort.");
    }
    return;
  }

  // ── /clearapps COMMAND ──
  if (interaction.isChatInputCommand() && interaction.commandName === "clearapps") {
    const count = applicationData.size;
    applicationData.clear();
    await interaction.reply({
      content: `🗑️ Cleared **${count}** application${count !== 1 ? "s" : ""} from memory.`,
      ephemeral: true
    });
    return;
  }

});

// ===== LOGIN =====
client.login(process.env.BOT_TOKEN);
module.exports = { client, applicationData, sendApplication };