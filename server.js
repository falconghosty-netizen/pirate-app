const express = require("express");
const session = require("express-session");

const app = express();

// ====== CONFIG ======
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env."sHa5rwsBcgTVgzZgyjHHyPcl2bo2lNTC";
const REDIRECT_URI = process.env.REDIRECT_URI;
const SHEET_URL = process.env."https://script.google.com/macros/s/AKfycbxEjWH4eRezJVw6Tdm9_2ojCgCQS_p0wDfztktR7WhsCaoFZoCCbp5i3_7o44iZglhl/exec";

// ====== MIDDLEWARE ======
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: false
  })
);

// ====== ROUTES ======

// Home (serve your HTML)
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// Login redirect
app.get("/login", (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=identify`;

  res.redirect(url);
});

// OAuth callback
app.get("/callback", async (req, res) => {
  const code = req.query.code;

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

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`
    }
  });

  const userData = await userRes.json();

  req.session.user = userData;

  res.redirect("/");
});

// Get logged-in user
app.get("/user", (req, res) => {
  res.json(req.session.user || null);
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ====== SUBMIT APPLICATION ======
app.post("/submit", async (req, res) => {
  try {
    const data = req.body;

    console.log("Received application:", data);

    const response = await fetch(SHEET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const text = await response.text();
    console.log("Apps Script response:", text);

    res.json({ success: true });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).send("Server error");
  }
});

// ====== START SERVER ======
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});