// src/events/playerEvents.js

function registerPlayerEvents(player) {
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

  // Suppressed: play.js reply handles "added to queue" confirmation
  player.events.on("audioTrackAdd", (queue, track) => {});
  player.events.on("audioTracksAdd", (queue, tracks) => {});

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

  player.events.on("playerError", (queue, error) => {
    const track = queue.currentTrack;
    console.error(
      `[PlayerError] Guild: ${queue.guild.id} | Track: ${track?.title} | ${error.message}`,
    );
    const channel = queue.metadata?.channel;
    channel
      ?.send(
        `⚠️ Couldn't play **${track?.title || "this track"}**: \`${error.message}\`\nSkipping...`,
      )
      .catch(() => {});
  });

  player.events.on("error", (queue, error) => {
    console.error(`[QueueError] Guild: ${queue.guild?.id} | ${error.message}`);
  });
}

module.exports = { registerPlayerEvents };
