// src/index.js
require("dotenv").config();

process.env.FFMPEG_PATH = require("ffmpeg-static");

const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { Player } = require("discord-player");
const { YoutubeExtractor } = require("discord-player-youtubei");
const { startKeepAlive } = require("./utils/keepAlive");
const { registerPlayerEvents } = require("./events/playerEvents");

const readyEvent = require("./events/ready");
const messageCreateEvent = require("./events/messageCreate");

// ─── Discord Client ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ─── discord-player ───────────────────────────────────────────────────────────
const player = new Player(client, {
  skipOnNoStream: false,
});

async function initExtractors() {
  await player.extractors.register(YoutubeExtractor, {
    streamOptions: {
      useClient: "TV",
    },
  });
  console.log("✅ YoutubeExtractor v3 loaded");

  await player.extractors.loadDefault();
  console.log(
    "✅ Other extractors loaded (Spotify, SoundCloud, Apple Music...)",
  );
}

initExtractors().catch((err) => {
  console.error("❌ Extractor init failed:", err.message);
});

registerPlayerEvents(player);
client.player = player;

// ─── Discord Events ───────────────────────────────────────────────────────────
client.once("clientReady", (...args) => readyEvent.execute(...args));

client.on(messageCreateEvent.name, (...args) =>
  messageCreateEvent.execute(...args),
);

client.on("error", (err) => console.error("[Discord Error]", err));
client.on("warn", (warn) => console.warn("[Discord Warn]", warn));

process.on("unhandledRejection", (reason) =>
  console.error("[Unhandled Rejection]", reason),
);
process.on("uncaughtException", (err) =>
  console.error("[Uncaught Exception]", err),
);

// ─── Keep-Alive ───────────────────────────────────────────────────────────────
startKeepAlive();

// ─── Login ────────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN not set in .env!");
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error("Failed to login:", err.message);
  process.exit(1);
});
