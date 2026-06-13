export const setupPlayerEvents = (player) => {
  player.on("debug", (message) => {
    if (
      message.includes("extractor") ||
      message.includes("Extractor") ||
      message.includes("search") ||
      message.includes("Search") ||
      message.includes("stream") ||
      message.includes("error") ||
      message.includes("Error")
    ) {
      console.log(`[General Debug]: ${message}`); // <-- already here, just add the filter
    }
  });
  player.events.on("debug", (queue, message) => {
    if (
      message.includes("extractor") ||
      message.includes("Extractor") ||
      message.includes("stream") ||
      message.includes("error") ||
      message.includes("Error")
    ) {
      console.log(`[Queue Debug]: ${message}`); // <-- already here, just add the filter
    }
  });
  // ─────────────────────────────────────────────────────────────

  player.events.on("playerStart", (queue, track) => {
    queue.metadata.channel.send(`🎵 Now Playing: **${track.title}**`);
  });

  player.events.on("audioTrackAdd", (queue, track) => {
    queue.metadata.channel.send(`📝 Track **${track.title}** queued!`);
  });

  player.events.on("disconnect", (queue) => {
    queue.metadata.channel.send("👋 Disconnected from the voice channel.");
  });

  player.events.on("emptyQueue", (queue) => {
    queue.metadata.channel.send(
      "Queue finished! Use `!play` to add more tracks. I'll stick around (24/7 mode).",
    );
  });

  player.events.on("error", (queue, error) => {
    console.error(`[Player Error]: ${error.message}`);
  });

  player.events.on("playerError", (queue, error) => {
    console.error(`[Audio Error]: ${error.message}`);
  });
};
