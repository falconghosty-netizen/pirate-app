const { Pool } = require("pg");

// internal railway connections skip ssl, public and proxy ones need it
const connectionString = process.env.DATABASE_URL;
const isInternal = (connectionString || "").includes(".railway.internal");

const pool = new Pool({
  connectionString,
  ssl: isInternal ? false : { rejectUnauthorized: false }
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres error:", err);
});

module.exports = pool;
