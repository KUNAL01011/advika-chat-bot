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

      // ── Query type detection ──────────────────────────────────────────────
      let searchQuery = query;
      let queryType = QueryType.AUTO;

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
        const host = url.hostname.replace("www.", "");

        // Let extractors handle all URLs automatically via AUTO
        queryType = QueryType.AUTO;

        if (host === "youtube.com" || host === "youtu.be") {
          const hasVideo = url.searchParams.has("v");
          const hasList = url.searchParams.has("list");

          if (hasVideo && hasList) {
            // Video-in-playlist URL: strip &list= to play just the video
            // Avoids queuing the whole playlist when a specific video was linked
            url.searchParams.delete("list");
            searchQuery = url.toString();
          }
        }
      } else {
        // Plain text — search YouTube directly
        queryType = QueryType.YOUTUBE_SEARCH;
      }

      // ── Search ────────────────────────────────────────────────────────────
      const searchResult = await player.search(searchQuery, {
        requestedBy: message.author,
        searchEngine: queryType,
      });

      if (!searchResult || searchResult.tracks.length === 0) {
        return loadingMsg.edit(
          `❌ No results found for \`${query}\`. Try a YouTube link instead.`,
        );
      }

      // ── Get or create queue ───────────────────────────────────────────────
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
        skipOnNoStream: true,
        bufferingTimeout: 3000,
        connectionTimeout: 20_000,
      });

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

      // ── Add tracks ────────────────────────────────────────────────────────
      if (searchResult.playlist) {
        queue.addTrack(searchResult.tracks);
      } else {
        queue.addTrack(searchResult.tracks[0]);
      }

      if (!queue.isPlaying()) {
        await queue.node.play();
      }

      // ── Reply ─────────────────────────────────────────────────────────────
      if (searchResult.playlist) {
        await loadingMsg.edit(
          `✅ Added **${searchResult.tracks.length} tracks** from **${searchResult.playlist.title}**!\n` +
            `🎵 First: **${searchResult.tracks[0].title}** — \`${searchResult.tracks[0].duration}\``,
        );
      } else {
        const track = searchResult.tracks[0];
        const alreadyPlaying =
          queue.currentTrack && queue.currentTrack.url !== track.url;
        if (alreadyPlaying) {
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
