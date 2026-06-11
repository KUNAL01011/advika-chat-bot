const { Player, Track, Playlist } = require("discord-player");
const { Client, GatewayIntentBits } = require("discord.js");
const ytSearch = require("yt-search");

async function test() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const player = new Player(client);
  
  const result = await ytSearch({ listId: "PL__GQ-SJLZE_zZruVwNS8xSeK6xYPAdh5" });
  if (result && result.videos.length > 0) {
     const playlist = new Playlist(player, {
         title: result.title || "YouTube Playlist",
         tracks: [],
         author: { name: result.author?.name || "YouTube" },
         description: result.title,
         thumbnail: result.image || result.thumbnail,
         type: "playlist",
         source: "youtube",
         id: "PL__GQ-SJLZE_zZruVwNS8xSeK6xYPAdh5",
         url: "https://www.youtube.com/playlist?list=PL__GQ-SJLZE_zZruVwNS8xSeK6xYPAdh5"
     });
     
     const tracks = result.videos.map(v => new Track(player, {
         title: v.title,
         url: `https://youtube.com/watch?v=${v.videoId}`,
         source: "youtube",
         duration: v.timestamp || "0:00",
         thumbnail: v.thumbnail,
         author: v.author?.name || "YouTube",
         playlist: playlist
     }));
     
     playlist.tracks = tracks;
     console.log("Playlist constructed:", playlist.title, "with", playlist.tracks.length, "tracks");
     console.log("First track:", playlist.tracks[0].title);
  }
  process.exit(0);
}
test().catch(console.error);