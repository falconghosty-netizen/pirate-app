const bcrypt = require("bcrypt");
const pool = require("./db");

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function getAdminById(id) {
  const { rows } = await pool.query(
    "SELECT id, username, role FROM admins WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

async function getAdminByUsername(username) {
  const { rows } = await pool.query(
    "SELECT * FROM admins WHERE username = $1",
    [username]
  );
  return rows[0] || null;
}

// any logged in admin, owner or staff
async function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const admin = await getAdminById(req.session.adminId);
  if (!admin) {
    return res.status(401).json({ error: "Not logged in" });
  }
  req.admin = admin;
  next();
}

// owner only actions, generating invite codes and wiping applications
async function requireOwner(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const admin = await getAdminById(req.session.adminId);
  if (!admin || admin.role !== "owner") {
    return res.status(403).json({ error: "Owner access only" });
  }
  req.admin = admin;
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  getAdminById,
  getAdminByUsername,
  requireAdmin,
  requireOwner
};
