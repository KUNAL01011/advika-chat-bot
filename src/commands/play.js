// src/commands/play.js
const { useMainPlayer, useQueue, QueryType } = require("discord-player");

module.exports = {
  name: "play",
  aliases: ["p"],
  description: "Play a song or playlist.",
  usage: "!play <song name or URL>",

  async execute(message, args) {
    if (!args.length) {
      return message.reply(
        "❌ Please provide a song name or URL.\nExample: `!play Blinding Lights`",
      );
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply("❌ You must be in a voice channel!");
    }

    const perms = voiceChannel.permissionsFor(message.client.user);
    if (!perms?.has("Connect") || !perms?.has("Speak")) {
      return message.reply(
        "❌ I need **Connect** and **Speak** permissions in your voice channel!",
      );
    }

    const query = args.join(" ");
    const loadingMsg = await message.reply(`🔍 Searching for \`${query}\`...`);

    try {
      const player = useMainPlayer();

      // Detect query type so we route to the RIGHT extractor
      // instead of letting Spotify extractor grab plain text searches
      let queryType;
      const url = (() => {
        try {
          return new URL(query);
        } catch {
          return null;
        }
      })();

      if (query.includes("spotify.com")) {
        if (query.includes("/playlist/"))
          queryType = QueryType.SPOTIFY_PLAYLIST;
        else if (query.includes("/album/")) queryType = QueryType.SPOTIFY_ALBUM;
        else if (query.includes("/track/")) queryType = QueryType.SPOTIFY_SONG;
        else queryType = QueryType.SPOTIFY_SONG;
      } else if (query.includes("soundcloud.com")) {
        queryType = QueryType.SOUNDCLOUD_TRACK;
      } else if (
        url &&
        (url.hostname === "www.youtube.com" ||
          url.hostname === "youtube.com") &&
        url.pathname === "/playlist" &&
        url.searchParams.has("list")
      ) {
        queryType = QueryType.YOUTUBE_PLAYLIST;
      } else if (query.includes("youtube.com") || query.includes("youtu.be")) {
        queryType = QueryType.YOUTUBE_VIDEO;
      } else {
        queryType = QueryType.YOUTUBE_SEARCH;
      }

      const searchResult = await player.search(query, {
        requestedBy: message.author,
        searchEngine: queryType,
      });

      if (!searchResult || searchResult.tracks.length === 0) {
        return loadingMsg.edit(
          `❌ No results found for \`${query}\`. Try a YouTube link instead.`,
        );
      }

      // Get or create the queue for this guild
      const queue = player.nodes.create(message.guild, {
        metadata: {
          channel: message.channel,
          requestedBy: message.author.tag,
        },
        leaveOnEmpty: false,
        leaveOnEnd: false,
        leaveOnStop: false,
        selfDeaf: true,
        volume: 80,
        skipOnNoStream: false, // 🔴 CHANGED: was true, was silently eating errors
        bufferingTimeout: 3000, // give stream 3s to buffer before giving up
        connectionTimeout: 20_000,
      });

      // Connect to VC if not already connected
      if (!queue.connection) {
        try {
          await queue.connect(voiceChannel);
        } catch (err) {
          queue.delete();
          return loadingMsg.edit(
            `❌ Could not join your voice channel: ${err.message}`,
          );
        }
      }

      // Add tracks to queue
      if (searchResult.playlist) {
        // Re-resolve each track through youtubei so streaming goes through youtubei not play-dl
        const resolvedTracks = [];
        for (const track of searchResult.tracks.slice(0, 50)) {
          try {
            const r = await player.search(`${track.title} ${track.author}`, {
              requestedBy: message.author,
              searchEngine: QueryType.YOUTUBE_SEARCH,
            });
            if (r.tracks[0]) resolvedTracks.push(r.tracks[0]);
          } catch {}
        }
        if (resolvedTracks.length === 0) {
          return loadingMsg.edit(
            `❌ Could not resolve any tracks from playlist.`,
          );
        }
        queue.addTrack(resolvedTracks);
      } else {
        queue.addTrack(searchResult.tracks[0]);
      }

      // Start playing if not already
      if (!queue.isPlaying()) {
        await queue.node.play();
      }

      // Reply
      if (searchResult.playlist) {
        await loadingMsg.edit(
          `✅ Added **${searchResult.tracks.length} tracks** from playlist!\n` +
            `🎵 First: **${searchResult.tracks[0].title}** — \`${searchResult.tracks[0].duration}\``,
        );
      } else {
        const track = searchResult.tracks[0];
        const isQueued =
          queue.tracks.size > 0 || queue.currentTrack?.title !== track.title;
        if (isQueued && queue.currentTrack) {
          await loadingMsg.edit(
            `✅ Added to queue: **${track.title}** — \`${track.duration}\`\n` +
              `📋 Position: **#${queue.tracks.size}**`,
          );
        } else {
          await loadingMsg.edit(
            `🎵 **Now Playing:** **${track.title}** — \`${track.duration}\``,
          );
        }
      }
    } catch (err) {
      console.error("[Play Command Error]", err);
      await loadingMsg.edit(
        `❌ Error: ${err.message || "Something went wrong."}`,
      );
    }
  },
};
