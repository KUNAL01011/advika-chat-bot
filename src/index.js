// src/index.js
require("dotenv").config();

process.env.FFMPEG_PATH = require("ffmpeg-static");

const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { Player, QueryType, useMainPlayer } = require("discord-player");
const {
  YoutubeExtractor,
  search: youtubeiSearch,
} = require("discord-player-youtubei");
const {
  SpotifyExtractor,
  AppleMusicExtractor,
  SoundCloudExtractor,
} = require("@discord-player/extractor");
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

// ─── Bridge stream function ───────────────────────────────────────────────────
// This is used by SpotifyExtractor (and AppleMusic) to stream audio.
// Instead of using the broken bridge (which checks for old YoutubeExtractor.instance),
// we manually search YouTube using youtubei and return the YT track URL.
// discord-player then picks it up and YoutubeExtractor (youtubei) streams it natively.
async function bridgeViaYoutubei(extractor, track) {
  const query = `${track.title} ${track.author}`.trim();
  try {
    const player = useMainPlayer();
    const result = await player.search(query, {
      searchEngine: QueryType.YOUTUBE_SEARCH,
    });
    if (!result || result.tracks.length === 0) {
      throw new Error(`No YouTube results found for: ${query}`);
    }
    // Return the YouTube URL — discord-player will stream it via YoutubeExtractor (youtubei)
    return result.tracks[0].url;
  } catch (err) {
    console.error(`[Bridge] Failed to bridge "${query}":`, err.message);
    throw err;
  }
}

// ─── Extractor init ───────────────────────────────────────────────────────────
async function initExtractors() {
  // 1. Register YoutubeExtractor from youtubei FIRST — it handles all YT streaming
  await player.extractors.register(YoutubeExtractor, {});
  console.log("✅ YoutubeExtractor (youtubei) loaded");

  // 2. Register Spotify with a custom createStream that bridges via youtubei
  //    This bypasses the broken defaultBridgeProvider which needs old YoutubeExtractor.instance
  await player.extractors.register(SpotifyExtractor, {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    createStream: bridgeViaYoutubei,
  });
  console.log("✅ SpotifyExtractor loaded (with youtubei bridge)");

  // 3. Register AppleMusic with same bridge
  await player.extractors.register(AppleMusicExtractor, {
    createStream: bridgeViaYoutubei,
  });
  console.log("✅ AppleMusicExtractor loaded (with youtubei bridge)");

  // 4. Register SoundCloud (streams directly, no bridge needed)
  await player.extractors.register(SoundCloudExtractor, {});
  console.log("✅ SoundCloudExtractor loaded");

  // 5. Load remaining extractors (Attachment etc), skip the ones we already loaded
  await player.extractors.loadDefault(
    (ext) =>
      ext !== "YouTubeExtractor" && // old YT extractor (uses broken play-dl)
      ext !== "YoutubeExtractor" && // alias
      ext !== "SpotifyExtractor" && // already loaded above
      ext !== "AppleMusicExtractor" && // already loaded above
      ext !== "SoundCloudExtractor", // already loaded above
  );
  console.log("✅ Remaining extractors loaded");
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    await initExtractors();
  } catch (err) {
    console.error("❌ Extractor init failed:", err.message);
  }

  registerPlayerEvents(player);
  client.player = player;

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

  startKeepAlive();

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
