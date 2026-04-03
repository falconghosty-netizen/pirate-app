const client = require("./bot");
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
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
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
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
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

// ===== SUBMIT =====
app.post("/submit", async (req, res) => {
  try {
    console.log("SUBMIT ROUTE HIT");

    const user = req.session.user;

    if (!user) {
      console.log("User not logged in");
      return res.status(401).json({ error: "Not logged in with Discord" });
    }

    const {
      ign,
      plans,
      experience,
      contribution
    } = req.body;

    console.log("Form data:", req.body);

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    if (!channel) {
      console.log("Channel not found");
      return res.status(500).send("Channel not found");
    }

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

    const embed = new EmbedBuilder()
      .setTitle("📥 New Application")
      .setColor(0x5865F2)
      .addFields(
        { name: "Minecraft IGN", value: ign || "N/A", inline: false },
        { name: "Discord Username", value: user.username || "N/A", inline: false },
        { name: "Discord ID", value: user.id || "N/A", inline: false },
        { name: "Plans", value: plans || "N/A", inline: false },
        { name: "Experience", value: experience || "N/A", inline: false },
        { name: "Contribution", value: contribution || "N/A", inline: false }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("accept")
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("deny")
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      embeds: [embed],
      components: [row]
    });

    console.log("Submission sent to Discord");

    res.json({ success: true });

  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    res.status(500).send("Error submitting");
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});