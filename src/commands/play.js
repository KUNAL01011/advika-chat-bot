// src/commands/play.js
const { useMainPlayer, QueryType } = require("discord-player");

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

      // ── Query type detection ────────────────────────────────────────────────
      // FIX: The previous code used QueryType.AUTO for YouTube playlists which is
      // unreliable on Render. We now use explicit types everywhere.
      //
      // The KEY fix for Spotify: do NOT use QueryType.SPOTIFY_* — just let
      // QueryType.AUTO handle Spotify URLs. The SpotifyExtractor resolves the
      // metadata and then discord-player-youtubei handles the bridge streaming.
      // Passing explicit Spotify QueryTypes can bypass the extractor routing.
      //
      // FIX for YouTube playlists with &list= in the URL:
      // discord-player-youtubei issue #13 — a URL like /watch?v=xxx&list=yyy is
      // mis-classified as youtubePlaylist by QueryResolver. We strip the &list=
      // param from single video URLs to avoid this.

      let searchQuery = query;
      let queryType;

      const isUrl = (() => {
        try {
          new URL(query);
          return true;
        } catch {
          return false;
        }
      })();

      if (isUrl) {
        const url = new URL(query);
        const hostname = url.hostname.replace("www.", "");

        if (hostname === "youtube.com" || hostname === "youtu.be") {
          const isPlaylistOnly =
            url.pathname === "/playlist" && url.searchParams.has("list");
          const isVideoInPlaylist =
            url.searchParams.has("v") && url.searchParams.has("list");

          if (isPlaylistOnly) {
            // Pure playlist URL — use AUTO so youtubei handles it fully
            queryType = QueryType.AUTO;
          } else if (isVideoInPlaylist) {
            // FIX: Strip &list= param — play just the video, not the whole
            // playlist. This avoids the youtubePlaylist mis-classification bug
            // in discord-player-youtubei. User can paste the playlist URL
            // directly if they want the whole thing.
            url.searchParams.delete("list");
            searchQuery = url.toString();
            queryType = QueryType.YOUTUBE_VIDEO;
          } else {
            // Clean video URL
            queryType = QueryType.YOUTUBE_VIDEO;
          }
        } else if (
          hostname === "open.spotify.com" ||
          hostname === "spotify.com"
        ) {
          // FIX: Use AUTO for Spotify — this lets the SpotifyExtractor claim the
          // track/playlist metadata, then routes audio via YoutubeExtractor bridge.
          // Using explicit SPOTIFY_SONG / SPOTIFY_PLAYLIST can cause routing issues
          // where discord-player skips the bridge and tries play-dl directly.
          queryType = QueryType.AUTO;
        } else if (hostname === "soundcloud.com") {
          queryType = QueryType.SOUNDCLOUD_TRACK;
        } else {
          queryType = QueryType.AUTO;
        }
      } else {
        // Plain text search → always go straight to YouTube search via youtubei
        queryType = QueryType.YOUTUBE_SEARCH;
      }

      const searchResult = await player.search(searchQuery, {
        requestedBy: message.author,
        searchEngine: queryType,
      });

      if (!searchResult || searchResult.tracks.length === 0) {
        return loadingMsg.edit(
          `❌ No results found for \`${query}\`. Try a YouTube link instead.`,
        );
      }

      // ── Get or create queue ─────────────────────────────────────────────────
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
        skipOnNoStream: false,
        bufferingTimeout: 3000,
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

      // ── Add tracks ─────────────────────────────────────────────────────────
      // FIX: REMOVED the re-search loop entirely. That loop did 50 sequential
      // YouTube searches (~30s total) which killed Render's free instance.
      // discord-player-youtubei handles bridging internally — just addTrack()
      // directly. The extractor lazily resolves the stream URL when it's time
      // to actually play, not when adding to queue.
      if (searchResult.playlist) {
        queue.addTrack(searchResult.tracks);
      } else {
        queue.addTrack(searchResult.tracks[0]);
      }

      // Start playing if not already
      if (!queue.isPlaying()) {
        await queue.node.play();
      }

      // ── Reply ───────────────────────────────────────────────────────────────
      if (searchResult.playlist) {
        await loadingMsg.edit(
          `✅ Added **${searchResult.tracks.length} tracks** from **${searchResult.playlist.title}**!\n` +
            `🎵 First: **${searchResult.tracks[0].title}** — \`${searchResult.tracks[0].duration}\``,
        );
      } else {
        const track = searchResult.tracks[0];
        const isQueued =
          queue.currentTrack && queue.currentTrack.url !== track.url;
        if (isQueued) {
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
      await loadingMsg
        .edit(`❌ Error: ${err.message || "Something went wrong."}`)
        .catch(() => {});
    }
  },
};
