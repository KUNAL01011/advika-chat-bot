// src/utils/search.js
// yt-search for text search + playlist lookup
// spotify-url-info for Spotify → YouTube resolution

const ytSearch = require("yt-search");

async function resolveTrack(query, requestedBy) {
  try {
    // ─── Spotify URL ──────────────────────────────────────
    if (query.includes("spotify.com")) {
      const spotify = require("spotify-url-info")(fetch);
      const tracks = await spotify.getTracks(query);

      if (!tracks || tracks.length === 0)
        throw new Error("No tracks found in Spotify link.");

      if (query.includes("/playlist/") || query.includes("/album/")) {
        const results = [];
        for (const t of tracks.slice(0, 50)) {
          const artist = t.artists?.[0]?.name || "";
          try {
            const found = await searchYouTube(
              `${t.name} ${artist}`,
              requestedBy,
            );
            if (found.length > 0) results.push(found[0]);
          } catch (_) {}
        }
        if (results.length === 0)
          throw new Error("Could not resolve any Spotify tracks.");
        return results;
      }

      // Single Spotify track
      const t = tracks[0];
      const artist = t.artists?.[0]?.name || "";
      return await searchYouTube(`${t.name} ${artist}`, requestedBy);
    }

    // ─── YouTube Playlist ─────────────────────────────────
    if (
      (query.includes("youtube.com") || query.includes("youtu.be")) &&
      query.includes("list=")
    ) {
      const match = query.match(/list=([a-zA-Z0-9_-]+)/);
      if (!match) throw new Error("Invalid YouTube playlist URL.");

      const result = await ytSearch({ listId: match[1] });
      if (!result?.videos?.length)
        throw new Error("Playlist is empty or private.");

      return result.videos.slice(0, 100).map((v) => ({
        title: v.title,
        url: v.url,
        duration: v.timestamp || "0:00",
        requestedBy,
      }));
    }

    // ─── YouTube Video URL ────────────────────────────────
    if (query.includes("youtube.com/watch") || query.includes("youtu.be/")) {
      // Use yt-search to get title/duration without hitting ytdl
      const result = await ytSearch({ videoId: extractVideoId(query) });
      if (result) {
        return [
          {
            title: result.title || "Unknown Title",
            url: `https://youtube.com/watch?v=${extractVideoId(query)}`,
            duration: result.timestamp || "0:00",
            requestedBy,
          },
        ];
      }
      // Fallback: use URL directly, yt-dlp will handle it fine
      return [
        {
          title: query,
          url: query,
          duration: "0:00",
          requestedBy,
        },
      ];
    }

    // ─── Plain Text Search ────────────────────────────────
    return await searchYouTube(query, requestedBy);
  } catch (err) {
    console.error("[resolveTrack Error]", err.message);
    throw new Error(err.message || `Could not find: \`${query}\``);
  }
}

async function searchYouTube(query, requestedBy) {
  const result = await ytSearch(query);
  const videos = result?.videos;

  if (!videos?.length) throw new Error(`No results found for: \`${query}\``);

  const video = videos[0];
  return [
    {
      title: video.title,
      url: video.url,
      duration: video.timestamp || "0:00",
      requestedBy,
    },
  ];
}

function extractVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

module.exports = { resolveTrack };
