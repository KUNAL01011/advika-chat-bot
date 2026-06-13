import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits } from "discord.js";
import { Player } from "discord-player";
import { YoutubeExtractor } from "discord-player-youtubei";
import {
  SpotifyExtractor,
  SoundCloudExtractor,
} from "@discord-player/extractor";
import ffmpeg from "ffmpeg-static";

// Adjust path if needed
import { startKeepAlive } from "./utils/keepAlive.js";
import { setupPlayerEvents } from "./events/playerEvents.js";
import { handleMessage } from "./events/messageCreate.js";

process.env.FFMPEG_PATH = ffmpeg;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const player = new Player(client);

// ==========================================
// BOOT SEQUENCE
// ==========================================
const init = async () => {
  // Load Extractors
  await player.extractors.register(YoutubeExtractor, {
    authentication: process.env.YOUTUBE_OAUTH,
    streamOptions: { useClient: "ANDROID" },
  });
  console.log("✅ YoutubeExtractor loaded with OAuth");

  // Setting up Spotify safely for future expansion
  await player.extractors.register(SpotifyExtractor, {
    clientId: process.env.SPOTIFY_CLIENT_ID || "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
  });
  console.log("✅ SpotifyExtractor loaded");

  await player.extractors.register(SoundCloudExtractor, {});
  console.log("✅ SoundCloudExtractor loaded");

  // Setup Event Listeners
  setupPlayerEvents(player);

  client.once("clientReady", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity("Kunal Kumar", { type: 3 });

    startKeepAlive(); // Uncomment if your keepAlive file is set up
  });

  client.on("messageCreate", (message) => handleMessage(message, player));
  client.on("error", console.error);

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("❌ DISCORD_TOKEN not found in .env");
    process.exit(1);
  }

  client.login(token);
};

init();
