// src/index.js
require("dotenv").config();

process.env.FFMPEG_PATH = require("ffmpeg-static");

const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { Player, QueryType, useMainPlayer } = require("discord-player");

// v2.0.0 exports YoutubeiExtractor (not YoutubeExtractor)
const { YoutubeiExtractor } = require("discord-player-youtubei");
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

// ─── Player ───────────────────────────────────────────────────────────────────
const player = new Player(client, {
  skipOnNoStream: true,
});

// ─── Spotify/AppleMusic bridge via YoutubeiExtractor ─────────────────────────
// SpotifyExtractor has no audio of its own — it needs a "bridge" function to
// find the audio on YouTube. We provide createStream which searches YouTube via
// discord-player (which routes through YoutubeiExtractor) and returns the YT URL.
// discord-player then streams that YT URL with YoutubeiExtractor's IOS client.
async function bridgeViaYoutubei(extractor, track) {
  const query = `${track.title} ${track.author}`.trim();
  try {
    const p = useMainPlayer();
    const result = await p.search(query, {
      searchEngine: QueryType.YOUTUBE_SEARCH,
    });
    if (!result || result.tracks.length === 0) {
      throw new Error(`No YouTube results for: ${query}`);
    }
    for (let i = 0; i < Math.min(3, result.tracks.length); i++) {
      const url = result.tracks[i].url;
      if (url) return url;
    }
    throw new Error(`No streamable URL found for: ${query}`);
  } catch (err) {
    console.error(`[Bridge] "${query}": ${err.message}`);
    throw err;
  }
}

// ─── Extractors ───────────────────────────────────────────────────────────────
async function initExtractors() {
  // Parse OAuth tokens from env if present
  const oauthTokens = process.env.YOUTUBEI_OAUTH_TOKENS
    ? JSON.parse(process.env.YOUTUBEI_OAUTH_TOKENS)
    : undefined;

  if (oauthTokens) {
    // OAuth mode: WEB client with tokens — most reliable, works on Render
    await player.extractors.register(YoutubeiExtractor, {
      authentication: oauthTokens,
      streamOptions: {
        useClient: "WEB",
      },
    });
    console.log("✅ YoutubeiExtractor (WEB + OAuth) loaded");
  } else {
    // Fallback: ANDROID is more resilient than IOS on datacenter IPs
    await player.extractors.register(YoutubeiExtractor, {
      streamOptions: {
        useClient: "ANDROID",
      },
    });
    console.log(
      "⚠️  YoutubeiExtractor (ANDROID, no OAuth) — may be rate-limited on Render",
    );
  }

  // 1. YoutubeiExtractor v2.0.0 — uses IOS client, no PoToken needed, works on Render
  await player.extractors.register(YoutubeiExtractor, {
    streamOptions: {
      useClient: "IOS", // IOS client works on datacenter IPs without PoToken
    },
  });
  console.log("✅ YoutubeiExtractor (IOS client) loaded");

  // 2. Spotify — metadata from Spotify API, audio bridged via YoutubeiExtractor
  await player.extractors.register(SpotifyExtractor, {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    createStream: bridgeViaYoutubei,
  });
  console.log("✅ SpotifyExtractor loaded");

  // 3. Apple Music — same bridge pattern as Spotify
  await player.extractors.register(AppleMusicExtractor, {
    createStream: bridgeViaYoutubei,
  });
  console.log("✅ AppleMusicExtractor loaded");

  // 4. SoundCloud — streams directly, no bridge needed
  await player.extractors.register(SoundCloudExtractor, {});
  console.log("✅ SoundCloudExtractor loaded");

  // 5. Remaining extractors (Attachment etc.) — skip ones already loaded above
  //    Also skip old YouTubeExtractor — it uses play-dl which is broken on Render
  await player.extractors.loadDefault(
    (ext) =>
      ext !== "YouTubeExtractor" &&
      ext !== "YoutubeExtractor" &&
      ext !== "SpotifyExtractor" &&
      ext !== "AppleMusicExtractor" &&
      ext !== "SoundCloudExtractor",
  );
  console.log("✅ Remaining extractors loaded");
}

// ─── Boot (extractors BEFORE login — no race condition) ──────────────────────
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
