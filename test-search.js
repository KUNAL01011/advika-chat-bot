require("dotenv").config();
const { Player } = require("discord-player");
const { Client, GatewayIntentBits } = require("discord.js");
const { YoutubeiExtractor } = require("discord-player-youtubei");
const { SpotifyExtractor } = require("@discord-player/extractor");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const player = new Player(client);

async function bridgeViaYoutubei(extractor, track) {
  const query = `${track.title} ${track.author}`.trim();
  const result = await player.search(query, { searchEngine: 'youtubeSearch' });
  return result.tracks[0]?.url;
}

async function test() {
  await player.extractors.register(YoutubeiExtractor, { streamOptions: { useClient: "IOS" } });
  await player.extractors.register(SpotifyExtractor, {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    createStream: bridgeViaYoutubei,
  });

  const urls = [
    "https://www.youtube.com/playlist?list=PL4fGSI1pDJn6jALT_vWaO8GvrvdftD2TC",
    "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
  ];
  for (const u of urls) {
    const res = await player.search(u, { searchEngine: 'auto' });
    console.log(u, "->", res.tracks.length, "tracks found. playlist:", !!res.playlist);
  }
  process.exit(0);
}
test().catch(console.error);
