// src/events/playerEvents.js
// discord-player emits these events — wire them in index.js via player.events.on(...)
// This file exports a function that registers all player events on the player instance.

function registerPlayerEvents(player) {
  // Fires when a new track starts playing
  player.events.on("playerStart", (queue, track) => {
    const channel = queue.metadata?.channel;
    if (!channel) return;
    channel
      .send(
        `🎵 **Now Playing:** [${track.title}](${track.url})\n` +
          `⏱ Duration: \`${track.duration}\` | 👤 Requested by: ${track.requestedBy?.tag || "Unknown"}`,
      )
      .catch(() => {});
  });

  // Fires when a track is added to the queue
  player.events.on("audioTrackAdd", (queue, track) => {
    // Only announce if something is already playing (otherwise playerStart handles it)
    if (queue.isPlaying() && queue.currentTrack?.url !== track.url) {
      const channel = queue.metadata?.channel;
      if (!channel) return;
      channel
        .send(`✅ Added to queue: **${track.title}** — \`${track.duration}\``)
        .catch(() => {});
    }
  });

  // Fires when multiple tracks are added (playlist)
  player.events.on("audioTracksAdd", (queue, tracks) => {
    const channel = queue.metadata?.channel;
    if (!channel) return;
    channel
      .send(
        `✅ Added **${tracks.length} tracks** to the queue!\n` +
          `🎵 First: **${tracks[0].title}**`,
      )
      .catch(() => {});
  });

  // Fires when queue finishes — bot stays in VC (24/7 mode)
  player.events.on("emptyQueue", (queue) => {
    const channel = queue.metadata?.channel;
    if (!channel) return;
    channel
      .send(
        "✅ Queue finished! Bot is still in VC.\n" +
          "Add more songs with `!play <song>` or use `!dc` to disconnect.",
      )
      .catch(() => {});
  });

  // Player errors
  player.events.on("playerError", (queue, error) => {
    console.error(`[PlayerError] Guild ${queue.guild.id}:`, error.message);
    console.error(
      `[PlayerError] Track:`,
      queue.currentTrack?.title,
      "| URL:",
      queue.currentTrack?.url,
    );
    console.error(`[PlayerError] Extractor:`, queue.currentTrack?.extractor);
    const channel = queue.metadata?.channel;
    channel?.send(`⚠️ Playback error: \`${error.message}\``).catch(() => {});
  });

  player.events.on("error", (queue, error) => {
    console.error(`[PlayerError] Guild ${queue.guild.id}:`, error);
    console.error(`[QueueError] Guild ${queue.guild.id}:`, error.message);
  });

  // Debug (optional — comment out in production)
  // player.events.on('debug', (queue, msg) => console.log(`[Player Debug]`, msg));
}

module.exports = { registerPlayerEvents };
