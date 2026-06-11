require("dotenv").config();
const { Player } = require("discord-player");
const { Client, GatewayIntentBits } = require("discord.js");
const { SpotifyExtractor } = require("@discord-player/extractor");
const { YoutubeiExtractor } = require("discord-player-youtubei");

async function run() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const player = new Player(client);

  async function bridgeViaYoutubei(ext, url, track) {
    console.log("BRIDGE CALLED with:");
    console.log("ext:", typeof ext);
    console.log("url:", typeof url, url);
    console.log("track:", track?.title);
    return null; // Just to see args
  }

  await player.extractors.register(YoutubeiExtractor, {});
  await player.extractors.register(SpotifyExtractor, {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    createStream: bridgeViaYoutubei
  });

  const res = await player.search("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", { searchEngine: 'auto' });
  console.log("Spotify search found:", res.tracks.length);
  
  if (res.tracks.length > 0) {
    try {
        await res.tracks[0].extractor.stream(res.tracks[0]);
    } catch(e) {}
  }
  process.exit(0);
}
run();
