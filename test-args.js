const { Player } = require("discord-player");
const { Client, GatewayIntentBits } = require("discord.js");
const { YoutubeiExtractor } = require("discord-player-youtubei");

async function test() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const player = new Player(client);

  await player.extractors.register(YoutubeiExtractor, { streamOptions: { useClient: "IOS" } });

  try {
    const res = await player.search("https://www.youtube.com/playlist?list=PL__GQ-SJLZE_zZruVwNS8xSeK6xYPAdh5", { searchEngine: 'auto' });
    console.log("Found:", res.tracks.length, "tracks. Playlist:", !!res.playlist);
  } catch (e) {
    console.log("Search error:", e.message);
  }
  process.exit(0);
}
test().catch(console.error);