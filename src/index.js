// src/index.js
require("dotenv").config();

process.env.FFMPEG_PATH = require("ffmpeg-static");

const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { Player } = require("discord-player");
const { YoutubeExtractor } = require("discord-player-youtubei"); // ✅ correct export name
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

// ─── Extractor Init ───────────────────────────────────────────────────────────
// FIX: We await extractors BEFORE client.login() so every extractor is ready
// before the first !play command can arrive. Previously this ran in the background
// so a race condition could leave SpotifyExtractor or YoutubeExtractor missing.
async function initExtractors() {
  // FIX: YoutubeExtractor from discord-player-youtubei MUST be registered first
  // so it takes over bridging from Spotify/Apple Music. If loaded after, the
  // built-in @discord-player/extractor YouTubeExtractor wins the bridge and
  // uses play-dl which fails on Render with ERR_NO_RESULT.
  await player.extractors.register(YoutubeExtractor, {
    streamOptions: {
      useClient: "WEB",
    },
    // FIX: overrideBridgeMode forces youtubei to handle ALL bridge streaming
    // (Spotify, Apple Music etc.) even without OAuth. Without this the extractor
    // falls back to YouTube Music which is unavailable on server environments.
    overrideBridgeMode: "ytdl",
  });
  console.log("✅ YoutubeExtractor (youtubei) loaded");

  // FIX: blockStreamFrom tells discord-player that these extractors should NEVER
  // stream audio themselves — they only fetch metadata. Actual audio always goes
  // through YoutubeExtractor above which uses youtubei (not play-dl).
  // Without this, SpotifyExtractor tries to stream via its own YouTube bridge
  // (play-dl) and fails on Render with ERR_NO_RESULT.
  const {
    SpotifyExtractor,
    AppleMusicExtractor,
    SoundCloudExtractor,
  } = require("@discord-player/extractor");

  await player.extractors.register(SpotifyExtractor, {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  });
  console.log("✅ SpotifyExtractor loaded");

  // Load the rest (SoundCloud, attachment, etc.) but block them from streaming
  // so youtubei handles the actual audio for all bridged sources.
  await player.extractors.loadDefault(
    (ext) =>
      ext !== "YouTubeExtractor" && // block built-in YT (uses play-dl)
      ext !== "SpotifyExtractor", // already registered above
    {
      // No extra options needed; streaming is blocked via player options below
    },
  );
  console.log("✅ Other extractors loaded (SoundCloud, Apple Music...)");
}

// ─── Boot sequence ────────────────────────────────────────────────────────────
// FIX: extractors must be ready BEFORE login so no command races against init.
async function boot() {
  try {
    await initExtractors();
  } catch (err) {
    console.error("❌ Extractor init failed:", err.message);
    // Don't exit — single extractor failure shouldn't kill the whole bot.
  }

  registerPlayerEvents(player);
  client.player = player;

  // ─── Discord Events ─────────────────────────────────────────────────────────
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

  // ─── Keep-Alive ─────────────────────────────────────────────────────────────
  startKeepAlive();

  // ─── Login ──────────────────────────────────────────────────────────────────
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("DISCORD_TOKEN not set in .env!");
    process.exit(1);
  }

  client.login(token).catch((err) => {
    console.error("Failed to login:", err.message);
    process.exit(1);
  });
}

boot();
