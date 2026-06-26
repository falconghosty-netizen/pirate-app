const fetch = require("node-fetch");

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const ACCEPTED_ROLE_ID = process.env.ACCEPTED_ROLE_ID || "1490830950697930892";

async function assignAcceptedRole(userId) {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${ACCEPTED_ROLE_ID}`,
    { method: "PUT", headers: { Authorization: `Bot ${BOT_TOKEN}` } }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to assign role (${res.status}): ${text}`);
  }
}

module.exports = { assignAcceptedRole };
