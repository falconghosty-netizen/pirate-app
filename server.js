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
    secure: false // IMPORTANT for localhost
  }
}));

// ===== ENV =====
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SHEET_URL = process.env.SHEET_URL;

// Debug (optional)
console.log("ENV CHECK:", {
  CLIENT_ID: !!CLIENT_ID,
  CLIENT_SECRET: !!CLIENT_SECRET,
  REDIRECT_URI,
  SHEET_URL
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
    // Exchange code for token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();

    // Get user info
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    const user = await userRes.json();

    // Save user in session
    req.session.user = user;

    res.redirect("/");
  } catch (err) {
    console.error(err);
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
    await fetch(SHEET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
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