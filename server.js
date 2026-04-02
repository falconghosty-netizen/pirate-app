const express = require("express");
const session = require("express-session");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "supersecretkey",
  resave: false,
  saveUninitialized: false
}));

// ===== ENV VARIABLES =====
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SHEET_URL = process.env.SHEET_URL;

// DEBUG (you can remove later)
console.log("REDIRECT_URI:", REDIRECT_URI);

// ===== HOME =====
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// ===== LOGIN =====
app.get("/login", (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

// ===== CALLBACK (VERY IMPORTANT) =====
app.get("/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.send("No code provided");
  }

  try {
    // Exchange code for access token
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

    if (!tokenData.access_token) {
      console.error("Token error:", tokenData);
      return res.send("Failed to get access token");
    }

    // Get user info
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    const user = await userRes.json();

    // Save session
    req.session.user = user;

    // Redirect back to site
    res.redirect("/");
  } catch (err) {
    console.error("Callback error:", err);
    res.send("OAuth failed");
  }
});

// ===== GET USER =====
app.get("/user", (req, res) => {
  res.json(req.session.user || null);
});

// ===== LOGOUT =====
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ===== SUBMIT FORM =====
app.post("/submit", async (req, res) => {
  try {
    const data = req.body;

    console.log("Application:", data);

    await fetch(SHEET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).send("Error submitting form");
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});