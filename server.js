const { client, applicationData } = require("./bot");
const express = require("express");
const session = require("express-session");
const path = require("path");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "secret123",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false
  }
}));

// ===== ENV =====
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

console.log("ENV CHECK:", {
  CLIENT_ID: !!CLIENT_ID,
  CLIENT_SECRET: !!CLIENT_SECRET,
  REDIRECT_URI
});

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, "public")));

// ===== HOME =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== LOGIN =====
app.get("/login", (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

// ===== CALLBACK =====
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code received");

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const user = await userRes.json();
    req.session.user = user;

    console.log("Logged in user:", user.username);
    res.redirect("/");
  } catch (err) {
    console.error("OAuth error:", err);
    res.send("Login failed");
  }
});

// ===== USER CHECK =====
app.get("/user", (req, res) => {
  res.json(req.session.user || null);
});

// ===== LOGOUT =====
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// Tracks Discord user IDs that have already submitted
const submittedUsers = new Set();

// Helper to truncate long answers for Discord embed (field limit: 1024 chars)
function truncate(str, max = 1024) {
  if (!str) return "N/A";
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

// ===== SUBMIT =====
app.post("/submit", async (req, res) => {
  try {
    const user = req.session.user;

    if (!user) {
      return res.status(401).json({ error: "Not logged in with Discord" });
    }

    if (submittedUsers.has(user.id)) {
      return res.status(409).json({ error: "You have already submitted an application." });
    }

    const {
      ign,
      about,
      plans,
      experience,
      rp2
    } = req.body;

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

    const embed = new EmbedBuilder()
      .setTitle("📥 New Application")
      .setColor(0x5865F2)
      .addFields(
        { name: "Minecraft IGN", value: "[hidden]" },
        { name: "Discord", value: "[hidden]" },
        { name: "About", value: truncate(about) },
        { name: "Plans", value: truncate(plans) },
        { name: "Experience", value: truncate(experience) },
        { name: "RP — The Traitor", value: truncate(rp2) }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("deny").setLabel("Deny").setStyle(ButtonStyle.Danger)
    );

    const message = await channel.send({
      embeds: [embed],
      components: [row]
    });

    // Mark this Discord account as having submitted
    submittedUsers.add(user.id);

    // Store real IGN, Discord, and userId keyed by message ID
    applicationData.set(message.id, {
      ign: ign || "N/A",
      discord: user.username || "N/A",
      userId: user.id
    });

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error submitting");
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
