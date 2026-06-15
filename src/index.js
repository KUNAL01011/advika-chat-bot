import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import { handleChatMessage } from "./events/messageCreate.js";
import { startKeepAlive } from "./utils/keepAlive.js";

// ─── Discord Client Setup ─────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ─── Event Handlers ───────────────────────────────────────────────────────────

client.once("ready", () => {
  console.log(`✅ Advika is online as ${client.user.tag}`);

  // Set a vibe-y status
  const statuses = [
    { name: "hum tum aur baatein 👀", type: ActivityType.Listening },
    { name: "koi interesting baat karo", type: ActivityType.Watching },
    { name: "dimag mat khao", type: ActivityType.Custom },
  ];

  // Rotate status every 30 minutes
  let statusIndex = 0;
  const setStatus = () => {
    const s = statuses[statusIndex % statuses.length];
    client.user.setActivity(s.name, { type: s.type });
    statusIndex++;
  };

  setStatus();
  setInterval(setStatus, 30 * 60 * 1000);
});

client.on("messageCreate", (message) => handleChatMessage(message, client));

client.on("error", (error) => {
  console.error("[Discord Error]:", error.message);
});

process.on("unhandledRejection", (error) => {
  console.error("[Unhandled Rejection]:", error);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ DISCORD_TOKEN not found in .env");
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY not found in .env");
  process.exit(1);
}

startKeepAlive();
client.login(token);

console.log("🚀 Advika booting up...");
