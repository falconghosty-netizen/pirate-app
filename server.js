const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const fetch = require("node-fetch");
require("dotenv").config();

const pool = require("./db");
const { assignAcceptedRole } = require("./discordRest");
const {
  hashPassword,
  verifyPassword,
  getAdminById,
  getAdminByUsername,
  requireAdmin,
  requireOwner
} = require("./auth");

const app = express();

// Behind Railway's proxy — needed so req.ip reflects the real client IP
// (X-Forwarded-For) instead of the proxy's own address.
app.set("trust proxy", 1);

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new pgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 * 30 } // 30 days
}));

// ===== ENV =====
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

console.log("ENV CHECK:", {
  CLIENT_ID: !!CLIENT_ID,
  CLIENT_SECRET: !!CLIENT_SECRET,
  REDIRECT_URI,
  DATABASE_URL: !!process.env.DATABASE_URL,
  BOT_TOKEN: !!process.env.BOT_TOKEN,
  GUILD_ID: !!process.env.GUILD_ID,
  ADMIN_SETUP_KEY: !!process.env.ADMIN_SETUP_KEY,
  SESSION_SECRET: !!process.env.SESSION_SECRET
});

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, "public")));

// ===== PAGE ROUTES =====
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/staff", (req, res) => res.sendFile(path.join(__dirname, "public", "staff.html")));
app.get("/admin/setup", (req, res) => res.sendFile(path.join(__dirname, "public", "admin-setup.html")));
app.get("/admin/login", (req, res) => res.sendFile(path.join(__dirname, "public", "admin-login.html")));
app.get("/admin/signup", (req, res) => res.sendFile(path.join(__dirname, "public", "admin-signup.html")));

// ===== DISCORD OAUTH (applicants) =====
app.get("/login", (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

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
    res.redirect("/?login=1");
  } catch (err) {
    console.error("OAuth error:", err);
    res.send("Login failed");
  }
});

app.get("/user", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.json(null);
  res.json({ ...user, alreadyApplied: await alreadyApplied(user.id) });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ===== HELPERS =====
async function alreadyApplied(discordId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM applications WHERE discord_id = $1 LIMIT 1",
    [discordId]
  );
  return rows.length > 0;
}

// Reads the persistent device_id cookie, generating and setting one if
// missing. No cookie-parser dependency — just a minimal manual parse,
// since this is the only custom cookie the app needs.
function getOrSetDeviceId(req, res) {
  const header = req.headers.cookie || "";
  const match = header.split(";").map(p => p.trim()).find(p => p.startsWith("device_id="));
  if (match) return decodeURIComponent(match.slice("device_id=".length));

  const id = crypto.randomUUID();
  res.cookie("device_id", id, {
    maxAge: 5 * 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax"
  });
  return id;
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const block = (n) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `SARK-${block(4)}-${block(4)}`;
}

// ===== SUBMIT (written) =====
app.post("/submit", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Not logged in with Discord" });

    if (await alreadyApplied(user.id)) {
      return res.status(409).json({ error: "You have already submitted an application." });
    }

    const { ign, about, plans, experience, rp2, rp3 } = req.body;
    const deviceId = getOrSetDeviceId(req, res);

    await pool.query(
      `INSERT INTO applications (discord_id, discord_username, ign, type, about, plans, experience, rp2, rp3, device_id, ip_address)
       VALUES ($1, $2, $3, 'written', $4, $5, $6, $7, $8, $9, $10)`,
      [
        user.id,
        user.username,
        ign || "N/A",
        about || "N/A",
        plans || "N/A",
        experience || "N/A",
        rp2 || "N/A",
        rp3 || "N/A",
        deviceId,
        req.ip
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error submitting");
  }
});

// ===== SUBMIT (video) =====
app.post("/submit-video", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Not logged in with Discord" });

    if (await alreadyApplied(user.id)) {
      return res.status(409).json({ error: "You have already submitted an application." });
    }

    const { ign, videoLink } = req.body;

    const allowedDomains = [
      "youtube.com", "youtu.be",
      "medal.tv",
      "twitch.tv", "clips.twitch.tv",
      "streamable.com",
      "drive.google.com",
      "imgur.com",
      "vimeo.com"
    ];

    let parsedUrl;
    try { parsedUrl = new URL(videoLink); } catch {
      return res.status(400).json({ error: "Invalid video link." });
    }
    const hostname = parsedUrl.hostname.replace(/^www\./, "");
    if (!allowedDomains.some(d => hostname === d || hostname.endsWith("." + d))) {
      return res.status(400).json({ error: "Video link must be from YouTube, Medal, Twitch, Streamable, Google Drive, Imgur, or Vimeo." });
    }

    const deviceId = getOrSetDeviceId(req, res);

    await pool.query(
      `INSERT INTO applications (discord_id, discord_username, ign, type, video_link, device_id, ip_address)
       VALUES ($1, $2, $3, 'video', $4, $5, $6)`,
      [user.id, user.username, ign || "N/A", videoLink, deviceId, req.ip]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error submitting video application");
  }
});

// ===== APPLICATION DRAFT (tied to Discord account) =====
app.get("/api/draft", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: "Not logged in with Discord" });

  try {
    const { rows } = await pool.query(
      "SELECT data FROM application_drafts WHERE discord_id = $1",
      [user.id]
    );
    res.json({ data: rows[0]?.data || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load draft" });
  }
});

app.post("/api/draft", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: "Not logged in with Discord" });

  try {
    await pool.query(
      `INSERT INTO application_drafts (discord_id, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (discord_id) DO UPDATE SET data = $2, updated_at = now()`,
      [user.id, JSON.stringify(req.body || {})]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save draft" });
  }
});

app.delete("/api/draft", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: "Not logged in with Discord" });

  try {
    await pool.query("DELETE FROM application_drafts WHERE discord_id = $1", [user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to clear draft" });
  }
});

// =========================================================
// ===== ADMIN ACCOUNTS (username/password, not Discord) =====
// =========================================================

// One-time bootstrap: creates the very first ('owner') account.
// Only works while the admins table is empty.
app.post("/api/admin/setup", async (req, res) => {
  try {
    const { setupKey, username, password } = req.body;

    if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({ error: "Invalid setup key" });
    }

    const { rows } = await pool.query("SELECT COUNT(*) FROM admins");
    if (parseInt(rows[0].count, 10) > 0) {
      return res.status(409).json({
        error: "An owner account already exists. Ask them for an invite code instead."
      });
    }

    if (!username || !password || password.length < 8) {
      return res.status(400).json({ error: "Username required, password must be at least 8 characters." });
    }

    const existing = await getAdminByUsername(username);
    if (existing) return res.status(409).json({ error: "Username already taken." });

    const hash = await hashPassword(password);
    const { rows: inserted } = await pool.query(
      `INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, 'owner')
       RETURNING id, username, role`,
      [username, hash]
    );

    req.session.adminId = inserted[0].id;
    res.json({ success: true, admin: inserted[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Setup failed" });
  }
});

// Staff redeem an invite code to create their own account.
app.post("/api/admin/signup", async (req, res) => {
  try {
    const { code, username, password } = req.body;
    if (!code || !username || !password || password.length < 8) {
      return res.status(400).json({ error: "All fields required, password must be at least 8 characters." });
    }

    const { rows: codeRows } = await pool.query(
      "SELECT * FROM admin_invite_codes WHERE code = $1 AND used_at IS NULL",
      [code.trim().toUpperCase()]
    );
    if (!codeRows.length) {
      return res.status(400).json({ error: "Invalid or already-used invite code." });
    }

    const existing = await getAdminByUsername(username);
    if (existing) return res.status(409).json({ error: "Username already taken." });

    const hash = await hashPassword(password);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: inserted } = await client.query(
        `INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, 'staff')
         RETURNING id, username, role`,
        [username, hash]
      );

      await client.query(
        "UPDATE admin_invite_codes SET used_at = now(), used_by = $1 WHERE id = $2",
        [username, codeRows[0].id]
      );

      await client.query("COMMIT");

      req.session.adminId = inserted[0].id;
      res.json({ success: true, admin: inserted[0] });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// Login
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await getAdminByUsername(username || "");
    if (!admin) return res.status(401).json({ error: "Invalid username or password." });

    const valid = await verifyPassword(password || "", admin.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid username or password." });

    req.session.adminId = admin.id;
    res.json({ success: true, admin: { username: admin.username, role: admin.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get("/api/admin/me", async (req, res) => {
  if (!req.session.adminId) return res.json({ loggedIn: false });
  const admin = await getAdminById(req.session.adminId);
  if (!admin) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, username: admin.username, role: admin.role, isOwner: admin.role === "owner" });
});

// Owner: generate a new invite code
app.post("/api/admin/generate-code", requireOwner, async (req, res) => {
  try {
    const code = generateInviteCode();
    await pool.query("INSERT INTO admin_invite_codes (code) VALUES ($1)", [code]);
    res.json({ success: true, code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate code" });
  }
});

// Owner: view invite code history (used / unused)
app.get("/api/admin/invite-codes", requireOwner, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT code, created_at, used_at, used_by FROM admin_invite_codes ORDER BY created_at DESC"
  );
  res.json({ codes: rows });
});

// Owner: list staff accounts
app.get("/api/admin/staff-list", requireOwner, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, username, role FROM admins WHERE role != 'owner' ORDER BY username ASC"
  );
  res.json({ staff: rows });
});

// Owner: remove a staff account
app.post("/api/admin/remove-staff", requireOwner, async (req, res) => {
  try {
    const { staffId } = req.body;
    if (!staffId) return res.status(400).json({ error: "staffId required" });

    const { rows } = await pool.query("SELECT role FROM admins WHERE id = $1", [staffId]);
    if (!rows.length) return res.status(404).json({ error: "Account not found" });
    if (rows[0].role === "owner") return res.status(403).json({ error: "Cannot remove the owner account" });

    await pool.query("DELETE FROM admins WHERE id = $1", [staffId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove staff" });
  }
});

// Owner: wipe all applications + ratings (admin accounts untouched)
app.post("/api/admin/clear-apps", requireOwner, async (req, res) => {
  try {
    const { confirmation } = req.body;
    if (confirmation !== "DELETE ALL APPLICATIONS") {
      return res.status(400).json({ error: "Confirmation phrase did not match." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM ratings");
      await client.query("DELETE FROM applications");
      await client.query("ALTER SEQUENCE applications_id_seq RESTART WITH 1");
      await client.query("ALTER SEQUENCE ratings_id_seq RESTART WITH 1");
      await client.query("UPDATE app_settings SET sorted = false WHERE id = 1");
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to clear applications" });
  }
});

// =========================================================
// ===== STAFF DASHBOARD API (requires admin login) =====
// =========================================================

// Any logged-in staff: check whether this batch has been sorted (locked
// into decision mode) yet. Server-side truth, so it survives refresh and
// is the same for every staff member.
app.get("/api/staff/sort-status", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT sorted FROM app_settings WHERE id = 1");
    res.json({ sorted: rows[0]?.sorted || false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load sort status" });
  }
});

// Owner: lock applications into "sorted" decision mode for everyone.
app.post("/api/staff/sort", requireOwner, async (req, res) => {
  try {
    await pool.query("UPDATE app_settings SET sorted = true WHERE id = 1");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to sort applications" });
  }
});

app.get("/api/staff/applications", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || "pending"; // pending | accepted | denied | all
    const type = req.query.type || "all"; // written | video | all
    const rated = req.query.rated; // "yes" | "no" | undefined

    let query = `
      SELECT
        a.id, a.seq_num, a.type, a.status, a.submitted_at, a.decided_by, a.decided_at,
        CASE WHEN a.status = 'pending' THEN NULL ELSE a.ign END AS ign,
        CASE WHEN a.status = 'pending' THEN NULL ELSE a.discord_username END AS discord_username,
        a.about, a.plans, a.experience, a.rp2, a.rp3, a.video_link,
        COALESCE(r.avg_score, 0)::float AS avg_score,
        COALESCE(r.rating_count, 0)::int AS rating_count,
        ur.score AS my_score
      FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY submitted_at ASC) AS seq_num
        FROM applications
      ) a
      LEFT JOIN (
        SELECT application_id, AVG(score) AS avg_score, COUNT(*) AS rating_count
        FROM ratings
        GROUP BY application_id
      ) r ON r.application_id = a.id
      LEFT JOIN ratings ur ON ur.application_id = a.id AND ur.staff_id = $1
      WHERE 1=1
    `;
    const params = [String(req.admin.id)];

    if (status !== "all") {
      params.push(status);
      query += ` AND a.status = $${params.length}`;
    }
    if (type !== "all") {
      params.push(type);
      query += ` AND a.type = $${params.length}`;
    }
    if (rated === "yes") query += ` AND ur.score IS NOT NULL`;
    if (rated === "no") query += ` AND ur.score IS NULL`;

    query += ` ORDER BY a.submitted_at ASC`;

    const { rows } = await pool.query(query, params);
    res.json({ applications: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load applications" });
  }
});

// Owner-only: groups of applications from different Discord accounts that
// share a device cookie or submission IP — a silent alt-account signal,
// never shown to applicants or non-owner staff.
app.get("/api/staff/flagged", requireOwner, async (req, res) => {
  try {
    const { rows: pairs } = await pool.query(`
      SELECT
        a1.id AS id1, a2.id AS id2,
        (a1.device_id = a2.device_id AND a1.device_id IS NOT NULL) AS device_match,
        (a1.ip_address = a2.ip_address AND a1.ip_address IS NOT NULL) AS ip_match
      FROM applications a1
      JOIN applications a2
        ON a1.id < a2.id
        AND a1.discord_id != a2.discord_id
        AND (
          (a1.device_id = a2.device_id AND a1.device_id IS NOT NULL)
          OR (a1.ip_address = a2.ip_address AND a1.ip_address IS NOT NULL)
        )
    `);

    if (!pairs.length) return res.json({ clusters: [] });

    // Union-find to group pairs into clusters (handles 3+ linked accounts).
    const parent = new Map();
    const find = (id) => {
      if (!parent.has(id)) parent.set(id, id);
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root);
      parent.set(id, root);
      return root;
    };
    const union = (a, b) => { parent.set(find(a), find(b)); };

    const clusterSignals = new Map(); // root -> { device: bool, ip: bool }
    pairs.forEach(p => {
      union(p.id1, p.id2);
    });
    pairs.forEach(p => {
      const root = find(p.id1);
      const sig = clusterSignals.get(root) || { device: false, ip: false };
      sig.device = sig.device || p.device_match;
      sig.ip = sig.ip || p.ip_match;
      clusterSignals.set(root, sig);
    });

    const groups = new Map(); // root -> Set of ids
    for (const id of parent.keys()) {
      const root = find(id);
      if (!groups.has(root)) groups.set(root, new Set());
      groups.get(root).add(id);
    }

    const allIds = [...parent.keys()];
    const { rows: apps } = await pool.query(
      `SELECT id, seq_num, ign, discord_username, discord_id, type, status, submitted_at
       FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY submitted_at ASC) AS seq_num FROM applications) a
       WHERE id = ANY($1::int[])`,
      [allIds]
    );
    const appById = new Map(apps.map(a => [a.id, a]));

    const clusters = [...groups.entries()].map(([root, idSet]) => ({
      signals: clusterSignals.get(root),
      applications: [...idSet].map(id => appById.get(id)).sort((a, b) => a.seq_num - b.seq_num)
    }));

    res.json({ clusters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load flagged applications" });
  }
});

app.post("/api/staff/rate", requireAdmin, async (req, res) => {
  try {
    const { applicationId, score } = req.body;
    const s = parseInt(score, 10);

    if (!applicationId || isNaN(s) || s < 1 || s > 10 || String(s) !== String(score).trim()) {
      return res.status(400).json({ error: "Score must be a whole number between 1 and 10." });
    }

    await pool.query(
      `INSERT INTO ratings (application_id, staff_id, staff_username, score)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (application_id, staff_id)
       DO UPDATE SET score = EXCLUDED.score, rated_at = now()`,
      [applicationId, String(req.admin.id), req.admin.username, s]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save rating" });
  }
});

app.post("/api/staff/decide", requireAdmin, async (req, res) => {
  try {
    const { applicationId, decision } = req.body;
    if (!["accept", "deny"].includes(decision)) {
      return res.status(400).json({ error: "Invalid decision" });
    }

    const { rows } = await pool.query("SELECT * FROM applications WHERE id = $1", [applicationId]);
    const application = rows[0];
    if (!application) return res.status(404).json({ error: "Application not found" });

    const newStatus = decision === "accept" ? "accepted" : "denied";

    await pool.query(
      `UPDATE applications SET status = $1, decided_by = $2, decided_at = now() WHERE id = $3`,
      [newStatus, req.admin.username, applicationId]
    );

    if (decision === "accept") {
      try {
        await assignAcceptedRole(application.discord_id);
      } catch (roleErr) {
        console.error("Role assignment failed:", roleErr);
        return res.json({
          success: true,
          warning: "Status updated, but assigning the Discord role failed. Check bot permissions."
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update decision" });
  }
});

// ===== DB INIT + START =====
async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("Database schema ready.");
}

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on port", PORT);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
