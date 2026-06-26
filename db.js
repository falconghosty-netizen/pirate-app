const { Pool } = require("pg");

// Railway injects DATABASE_URL automatically once you add a Postgres
// service to your project. Internal connections (...railway.internal)
// don't use SSL; public/proxy connections do.
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
