// src/index.js
require("dotenv").config();

process.env.FFMPEG_PATH = require("ffmpeg-static");

const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { Player, QueryType, useMainPlayer } = require("discord-player");
const {
  YoutubeiExtractor,
  getYoutubeiInstance,
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

// ─── Player ───────────────────────────────────────────────────────────────────
const player = new Player(client, { skipOnNoStream: false });

// ─── Spotify / Apple Music bridge ────────────────────────────────────────────
// ROOT CAUSE OF SILENCE:
// Returning a YouTube URL string from createStream causes discord-player to pass
// it directly to FFmpeg with -reconnect flags. FFmpeg then makes HTTP range
// requests to YouTube directly — which Render's datacenter IP cannot do.
// Result: bot joins VC, playerStart fires, but zero audio plays.
//
// THE FIX:
// Search YouTube via discord-player (which routes through YoutubeiExtractor).
// Then call YoutubeiExtractor.instance.stream(track) to get a Node.js Readable
// stream that is already authenticated and fetched through youtubei's session.
// discord-player pipes that Readable directly to FFmpeg stdin — no HTTP from FFmpeg.
async function bridgeViaYoutubei(extractor, spotifyTrack) {
  const query = `${spotifyTrack.title} ${spotifyTrack.author}`.trim();

  try {
    const p = useMainPlayer();

    // Step 1: Find the YouTube track
    const result = await p.search(query, {
      searchEngine: QueryType.YOUTUBE_SEARCH,
    });

    if (!result || result.tracks.length === 0) {
      throw new Error(`No YouTube results for: ${query}`);
    }

    const ytTrack = result.tracks[0];

    // Step 2: Get a Readable stream from YoutubeiExtractor directly
    // This uses the authenticated session (OAuth or IOS client) to fetch audio,
    // returning a Node.js Readable — NOT a URL string that FFmpeg would fetch itself.
    const ytExtractorInstance = YoutubeiExtractor.instance;
    if (!ytExtractorInstance) {
      throw new Error("YoutubeiExtractor not initialized");
    }

    const stream = await ytExtractorInstance.stream(ytTrack);
    return stream;
  } catch (err) {
    console.error(`[Bridge] "${query}": ${err.message}`);
    throw err;
  }
}

// ─── Extractors ───────────────────────────────────────────────────────────────
async function initExtractors() {
  const oauthToken =
    process.env.YOUTUBE_OAUTH_TOKEN || process.env.YOUTUBEI_OAUTH_TOKENS;

  const youtubeiOptions = oauthToken
    ? {
        authentication: oauthToken,
        streamOptions: { useClient: "WEB" },
        logLevel: "NONE",
      }
    : {
        streamOptions: { useClient: "IOS" },
      };

  // Register YoutubeiExtractor FIRST — its .instance is used by bridgeViaYoutubei
  await player.extractors.register(YoutubeiExtractor, youtubeiOptions);
  console.log(
    oauthToken
      ? "✅ YoutubeiExtractor loaded (WEB + OAuth)"
      : "✅ YoutubeiExtractor loaded (IOS)",
  );

  // Spotify: metadata from Spotify, audio streamed via YoutubeiExtractor Readable
  await player.extractors.register(SpotifyExtractor, {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    createStream: bridgeViaYoutubei,
  });
  console.log("✅ SpotifyExtractor loaded");

  // Apple Music: same bridge
  await player.extractors.register(AppleMusicExtractor, {
    createStream: bridgeViaYoutubei,
  });
  console.log("✅ AppleMusicExtractor loaded");

  // SoundCloud: streams directly
  await player.extractors.register(SoundCloudExtractor, {});
  console.log("✅ SoundCloudExtractor loaded");

  // Load remaining (Attachment etc.), skip ones already registered and old YT (play-dl)
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
    console.error("DISCORD_TOKEN not set!");
    process.exit(1);
  }

  client.login(token).catch((err) => {
    console.error("Login failed:", err.message);
    process.exit(1);
  });
}

boot();
