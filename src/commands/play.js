// src/commands/play.js
const { useMainPlayer, QueryType, Track } = require("discord-player");

// ── YouTube Playlist via Data API v3 ─────────────────────────────────────────
// youtubei.js v16 has a ContinuationItemView parser bug that breaks all playlist
// fetches via discord-player-youtubei. The YouTube Data API v3 is reliable,
// free (10,000 units/day, each playlist fetch = ~1-2 units), and has no IP
// restrictions. Requires YOUTUBE_API_KEY env var (Google Cloud Console, free).
async function fetchYouTubePlaylist(playlistId, requestedBy, player) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  try {
    const https = require("https");
    const tracks = [];
    let pageToken = "";
    let playlistTitle = "YouTube Playlist";

    // Fetch up to 200 tracks (4 pages of 50)
    for (let page = 0; page < 4; page++) {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}${pageToken ? `&pageToken=${pageToken}` : ""}&key=${apiKey}`;

      const data = await new Promise((resolve, reject) => {
        https
          .get(url, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(e);
              }
            });
          })
          .on("error", reject);
      });

      if (data.error) {
        console.error("[YT Playlist API] Error:", data.error.message);
        return null;
      }

      if (page === 0 && data.items?.[0]?.snippet?.channelTitle) {
        // Get playlist title separately
        const plUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`;
        const plData = await new Promise((resolve, reject) => {
          https
            .get(plUrl, (res) => {
              let body = "";
              res.on("data", (chunk) => (body += chunk));
              res.on("end", () => {
                try {
                  resolve(JSON.parse(body));
                } catch (e) {
                  reject(e);
                }
              });
            })
            .on("error", reject);
        });
        playlistTitle = plData.items?.[0]?.snippet?.title || "YouTube Playlist";
      }

      for (const item of data.items || []) {
        const snippet = item.snippet;
        const videoId = snippet?.resourceId?.videoId;
        if (
          !videoId ||
          snippet?.title === "Deleted video" ||
          snippet?.title === "Private video"
        )
          continue;

        tracks.push(
          new Track(player, {
            title: snippet.title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            duration: "0:00", // duration not available in playlistItems API
            thumbnail:
              snippet.thumbnails?.medium?.url ||
              snippet.thumbnails?.default?.url ||
              "",
            author:
              snippet.videoOwnerChannelTitle ||
              snippet.channelTitle ||
              "YouTube",
            requestedBy,
            source: "youtube",
            queryType: QueryType.YOUTUBE_VIDEO,
          }),
        );
      }

      pageToken = data.nextPageToken || "";
      if (!pageToken) break;
    }

    if (tracks.length === 0) return null;

    return { tracks, title: playlistTitle };
  } catch (err) {
    console.error("[YT Playlist API] Fetch failed:", err.message);
    return null;
  }
}

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

      const isUrl = (() => {
        try {
          new URL(query);
          return true;
        } catch {
          return false;
        }
      })();

      // ── YouTube Playlist — bypass youtubei parser bug via Data API v3 ─────
      if (isUrl) {
        const url = new URL(query);
        const host = url.hostname.replace("www.", "");

        if (
          (host === "youtube.com" || host === "youtu.be") &&
          url.searchParams.has("list")
        ) {
          const listId = url.searchParams.get("list");
          const hasVideo = url.searchParams.has("v");

          // Pure playlist URL (no video ID) — use Data API
          if (!hasVideo) {
            await loadingMsg.edit(`🔍 Loading playlist...`);
            const result = await fetchYouTubePlaylist(
              listId,
              message.author,
              player,
            );

            if (result && result.tracks.length > 0) {
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

              if (!queue.connection) {
                try {
                  await queue.connect(voiceChannel);
                } catch (err) {
                  queue.delete();
                  return loadingMsg.edit(
                    `❌ Could not join VC: ${err.message}`,
                  );
                }
              }

              queue.addTrack(result.tracks);
              if (!queue.isPlaying()) await queue.node.play();

              return loadingMsg.edit(
                `✅ Added **${result.tracks.length} tracks** from **${result.title}**!\n` +
                  `🎵 First: **${result.tracks[0].title}**`,
              );
            }

            // If API key missing or failed, tell user
            if (!process.env.YOUTUBE_API_KEY) {
              return loadingMsg.edit(
                `❌ YouTube playlists require a \`YOUTUBE_API_KEY\` env variable.\n` +
                  `Get a free key at: <https://console.cloud.google.com> → Enable YouTube Data API v3 → Create API Key`,
              );
            }
            return loadingMsg.edit(
              `❌ Could not load playlist. The playlist may be private or empty.`,
            );
          }

          // Video-in-playlist URL (?v=xxx&list=yyy) — strip list, play just the video
          url.searchParams.delete("list");
          const videoResult = await player.search(url.toString(), {
            requestedBy: message.author,
            searchEngine: QueryType.YOUTUBE_VIDEO,
          });
          if (!videoResult || videoResult.tracks.length === 0) {
            return loadingMsg.edit(`❌ Could not find that video.`);
          }

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
          if (!queue.connection) {
            try {
              await queue.connect(voiceChannel);
            } catch (err) {
              queue.delete();
              return loadingMsg.edit(`❌ Could not join VC: ${err.message}`);
            }
          }
          queue.addTrack(videoResult.tracks[0]);
          if (!queue.isPlaying()) await queue.node.play();
          const t = videoResult.tracks[0];
          return loadingMsg.edit(
            `🎵 **Now Playing:** **${t.title}** — \`${t.duration}\``,
          );
        }
      }

      // ── All other queries (Spotify, SoundCloud, YT video, text search) ────
      let queryType = isUrl ? QueryType.AUTO : QueryType.YOUTUBE_SEARCH;

      const searchResult = await player.search(query, {
        requestedBy: message.author,
        searchEngine: queryType,
      });

      if (!searchResult || searchResult.tracks.length === 0) {
        return loadingMsg.edit(
          `❌ No results found for \`${query}\`. Try a YouTube link instead.`,
        );
      }

      const queue = player.nodes.create(message.guild, {
        metadata: { channel: message.channel, requestedBy: message.author.tag },
        leaveOnEmpty: false,
        leaveOnEnd: false,
        leaveOnStop: false,
        selfDeaf: true,
        volume: 80,
        skipOnNoStream: false,
        bufferingTimeout: 3000,
        connectionTimeout: 20_000,
      });

      if (!queue.connection) {
        try {
          await queue.connect(voiceChannel);
        } catch (err) {
          queue.delete();
          return loadingMsg.edit(`❌ Could not join VC: ${err.message}`);
        }
      }

      if (searchResult.playlist) {
        queue.addTrack(searchResult.tracks);
      } else {
        queue.addTrack(searchResult.tracks[0]);
      }

      if (!queue.isPlaying()) await queue.node.play();

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
            `✅ Added to queue: **${track.title}** — \`${track.duration}\`\n📋 Position: **#${queue.tracks.size}**`,
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
