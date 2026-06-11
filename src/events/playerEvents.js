// src/events/playerEvents.js
// discord-player emits these events — registered in index.js via registerPlayerEvents()

function registerPlayerEvents(player) {
  // ── Now playing ─────────────────────────────────────────────────────────────
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

  // FIX: audioTrackAdd double-announces on playlist loads because playerStart
  // fires for each track too. We now ONLY announce for single-track adds while
  // something is already playing (the track you just queued after the current one).
  // Playlist adds are announced in play.js's reply, so we skip them here entirely.
  player.events.on("audioTrackAdd", (queue, track) => {
    // Suppress — play.js reply handles the "added to queue" message.
    // If you want per-track announcements for single adds while playing,
    // uncomment the block below:
    //
    // if (queue.isPlaying() && queue.tracks.size === 1) {
    //   const channel = queue.metadata?.channel;
    //   if (!channel) return;
    //   channel.send(`✅ Added to queue: **${track.title}** — \`${track.duration}\``).catch(() => {});
    // }
  });

  // Playlist bulk add — suppress, play.js handles this reply too
  player.events.on("audioTracksAdd", (queue, tracks) => {
    // Suppress — play.js already confirms playlist loads
  });

  // ── Queue empty ─────────────────────────────────────────────────────────────
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

  // ── Errors ──────────────────────────────────────────────────────────────────
  // FIX: playerError and error were both logging the same thing. Separated them.
  // playerError = a single track failed to stream (skip it, tell the user)
  // error = queue-level failure (more severe)
  player.events.on("playerError", (queue, error) => {
    const track = queue.currentTrack;
    console.error(
      `[PlayerError] Guild: ${queue.guild.id} | Track: ${track?.title} | ${error.message}`,
    );
    const channel = queue.metadata?.channel;
    if (!channel) return;
    channel
      .send(
        `⚠️ Couldn't play **${track?.title || "this track"}**: \`${error.message}\`\n` +
          `Skipping to the next track...`,
      )
      .catch(() => {});
  });

  player.events.on("error", (queue, error) => {
    console.error(`[QueueError] Guild: ${queue.guild?.id} | ${error.message}`);
  });

  // Optional debug — uncomment to diagnose extraction issues
  // player.events.on("debug", (queue, msg) => console.log(`[Player Debug]`, msg));
}

module.exports = { registerPlayerEvents };
