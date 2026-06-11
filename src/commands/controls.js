// src/commands/controls.js
// All music control commands: skip, pause, resume, stop, queue, nowplaying,
// volume, loop, shuffle, remove, clear, dc, help

const { useQueue, useMainPlayer } = require("discord-player");

// Helper — get queue and validate it exists
function getQueue(message) {
  const queue = useQueue(message.guild.id);
  if (
    !queue ||
    (!queue.isPlaying() && queue.tracks.size === 0 && !queue.currentTrack)
  ) {
    message.reply(
      "❌ Nothing is playing right now! Use `!play <song>` to start.",
    );
    return null;
  }
  return queue;
}

const commands = {
  // ─── SKIP ─────────────────────────────────────────────────────────────────
  skip: {
    name: "skip",
    aliases: ["s", "next"],
    description: "Skip the current track.",
    execute(message) {
      const queue = getQueue(message);
      if (!queue) return;
      const title = queue.currentTrack?.title || "current track";
      queue.node.skip();
      message.reply(`⏭ Skipped **${title}**`);
    },
  },

  // ─── PAUSE ────────────────────────────────────────────────────────────────
  pause: {
    name: "pause",
    aliases: [],
    description: "Pause playback.",
    execute(message) {
      const queue = getQueue(message);
      if (!queue) return;
      if (queue.node.isPaused()) {
        return message.reply("⏸ Already paused! Use `!resume` to continue.");
      }
      queue.node.pause();
      message.reply(`⏸ Paused **${queue.currentTrack?.title}**`);
    },
  },

  // ─── RESUME ───────────────────────────────────────────────────────────────
  resume: {
    name: "resume",
    aliases: ["r"],
    description: "Resume playback.",
    execute(message) {
      const queue = getQueue(message);
      if (!queue) return;
      if (!queue.node.isPaused()) {
        return message.reply("▶️ Already playing!");
      }
      queue.node.resume();
      message.reply(`▶️ Resumed **${queue.currentTrack?.title}**`);
    },
  },

  // ─── STOP ─────────────────────────────────────────────────────────────────
  // Clears queue + stops player, but bot STAYS in VC (24/7 mode)
  stop: {
    name: "stop",
    aliases: [],
    description: "Stop music and clear the queue. Bot stays in VC.",
    execute(message) {
      const queue = getQueue(message);
      if (!queue) return;
      queue.delete(); // clears queue and stops player
      message.reply(
        "⏹ Stopped music and cleared the queue. Bot is still in VC — use `!dc` to disconnect.",
      );
    },
  },

  // ─── DISCONNECT ───────────────────────────────────────────────────────────
  dc: {
    name: "dc",
    aliases: ["leave", "disconnect"],
    description: "Disconnect the bot from the voice channel.",
    execute(message) {
      const queue = useQueue(message.guild.id);
      if (queue) {
        queue.delete();
      }

      const connection = message.guild.voiceStates.cache.get(
        message.client.user.id,
      )?.channel;
      if (connection) {
        const { getVoiceConnection } = require("@discordjs/voice");
        const conn = getVoiceConnection(message.guild.id);
        if (conn) conn.destroy();
      }

      message.reply("👋 Disconnected from voice channel!");
    },
  },

  // ─── QUEUE ────────────────────────────────────────────────────────────────
  queue: {
    name: "queue",
    aliases: ["q", "list"],
    description: "Show the current queue.",
    execute(message) {
      const queue = getQueue(message);
      if (!queue) return;

      const tracks = queue.tracks.toArray();
      let msg = `📋 **Queue for ${message.guild.name}**\n\n`;

      if (queue.currentTrack) {
        msg += `**Now Playing:**\n🎵 ${queue.currentTrack.title} — \`${queue.currentTrack.duration}\`\n\n`;
      }

      if (tracks.length === 0) {
        msg += "_No tracks in queue._\n";
      } else {
        msg += `**Up Next (${tracks.length} track${tracks.length > 1 ? "s" : ""}):**\n`;
        tracks.slice(0, 10).forEach((t, i) => {
          msg += `\`${i + 1}.\` ${t.title} — \`${t.duration}\`\n`;
        });
        if (tracks.length > 10)
          msg += `\n...and **${tracks.length - 10}** more tracks`;
      }

      const loopModes = ["OFF", "TRACK", "QUEUE", "AUTOPLAY"];
      msg += `\n🔁 Loop: \`${loopModes[queue.repeatMode] || "OFF"}\` | 🔊 Volume: \`${queue.node.volume}%\``;

      message.reply({ content: msg });
    },
  },

  // ─── NOW PLAYING ──────────────────────────────────────────────────────────
  nowplaying: {
    name: "nowplaying",
    aliases: ["np", "current"],
    description: "Show the currently playing track.",
    execute(message) {
      const queue = getQueue(message);
      if (!queue) return;
      const t = queue.currentTrack;
      if (!t) return message.reply("❌ Nothing is currently playing!");

      const progress = queue.node.createProgressBar();
      message.reply(
        `🎵 **Now Playing**\n` +
          `**${t.title}**\n` +
          `${progress}\n` +
          `⏱ Duration: \`${t.duration}\` | 👤 Requested by: ${t.requestedBy?.tag || "Unknown"}\n` +
          `🔗 ${t.url}`,
      );
    },
  },

  // ─── VOLUME ───────────────────────────────────────────────────────────────
  volume: {
    name: "volume",
    aliases: ["vol", "v"],
    description: "Set volume (0–100). Example: !volume 80",
    execute(message, args) {
      const queue = getQueue(message);
      if (!queue) return;
      const vol = parseInt(args[0]);
      if (isNaN(vol) || vol < 0 || vol > 100) {
        return message.reply(
          "❌ Volume must be between `0` and `100`.\nExample: `!volume 75`",
        );
      }
      queue.node.setVolume(vol);
      message.reply(`🔊 Volume set to **${vol}%**`);
    },
  },

  // ─── LOOP ─────────────────────────────────────────────────────────────────
  loop: {
    name: "loop",
    aliases: ["repeat"],
    description:
      "Toggle loop modes. `!loop` = track, `!loop queue` = queue, `!loop off` = off.",
    execute(message, args) {
      const queue = getQueue(message);
      if (!queue) return;

      const { QueueRepeatMode } = require("discord-player");

      const mode = args[0]?.toLowerCase();
      if (mode === "queue" || mode === "q") {
        queue.setRepeatMode(QueueRepeatMode.QUEUE);
        message.reply("🔁 Queue loop **enabled** — entire queue will repeat.");
      } else if (mode === "off" || mode === "0") {
        queue.setRepeatMode(QueueRepeatMode.OFF);
        message.reply("➡️ Loop **disabled**.");
      } else if (mode === "autoplay") {
        queue.setRepeatMode(QueueRepeatMode.AUTOPLAY);
        message.reply(
          "🔁 **Autoplay** enabled — bot will keep adding related songs.",
        );
      } else {
        // Toggle track loop
        if (queue.repeatMode === QueueRepeatMode.TRACK) {
          queue.setRepeatMode(QueueRepeatMode.OFF);
          message.reply("➡️ Track loop **disabled**.");
        } else {
          queue.setRepeatMode(QueueRepeatMode.TRACK);
          message.reply(
            "🔂 Track loop **enabled** — current track will repeat.",
          );
        }
      }
    },
  },

  // ─── SHUFFLE ──────────────────────────────────────────────────────────────
  shuffle: {
    name: "shuffle",
    aliases: [],
    description: "Shuffle the queue.",
    execute(message) {
      const queue = getQueue(message);
      if (!queue) return;
      if (queue.tracks.size < 2) {
        return message.reply(
          "❌ Need at least 2 songs in the queue to shuffle!",
        );
      }
      queue.tracks.shuffle();
      message.reply(`🔀 Shuffled **${queue.tracks.size}** tracks!`);
    },
  },

  // ─── REMOVE ───────────────────────────────────────────────────────────────
  remove: {
    name: "remove",
    aliases: ["rm", "delete"],
    description: "Remove a track from queue by position. Example: !remove 3",
    execute(message, args) {
      const queue = getQueue(message);
      if (!queue) return;
      const pos = parseInt(args[0]);
      const tracks = queue.tracks.toArray();
      if (isNaN(pos) || pos < 1 || pos > tracks.length) {
        return message.reply(
          `❌ Invalid position. Queue has **${tracks.length}** tracks.`,
        );
      }
      const removed = tracks[pos - 1];
      queue.node.remove(removed);
      message.reply(`🗑 Removed **${removed.title}** from the queue.`);
    },
  },

  // ─── CLEAR ────────────────────────────────────────────────────────────────
  clear: {
    name: "clear",
    aliases: [],
    description: "Clear the queue (keeps current track playing).",
    execute(message) {
      const queue = getQueue(message);
      if (!queue) return;
      const count = queue.tracks.size;
      queue.tracks.clear();
      message.reply(`🗑 Cleared **${count}** tracks from the queue.`);
    },
  },

  // ─── JOIN ─────────────────────────────────────────────────────────────────
  join: {
    name: "join",
    aliases: ["j", "come"],
    description: "Make the bot join your voice channel (for 24/7 mode).",
    async execute(message) {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply("❌ You must be in a voice channel!");
      }
      const {
        joinVoiceChannel,
        VoiceConnectionStatus,
        entersState,
      } = require("@discordjs/voice");
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true,
      });
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        message.reply(
          `✅ Joined **${voiceChannel.name}**! Bot will stay here 24/7.`,
        );
      } catch {
        connection.destroy();
        message.reply("❌ Could not join the voice channel. Try again.");
      }
    },
  },

  // ─── HELP ─────────────────────────────────────────────────────────────────
  help: {
    name: "help",
    aliases: ["h", "commands"],
    description: "Show all commands.",
    execute(message) {
      message.reply(
        `🎵 **Aurix Music Bot** (prefix: \`!\`)\n\n` +
          `**Playback**\n` +
          `\`!play <song/URL>\` — YouTube, Spotify, SoundCloud, Apple Music\n` +
          `\`!skip\` \`!s\` — Skip current track\n` +
          `\`!pause\` — Pause playback\n` +
          `\`!resume\` \`!r\` — Resume playback\n` +
          `\`!stop\` — Stop + clear queue (bot stays in VC)\n` +
          `\`!dc\` \`!leave\` — Disconnect bot from VC\n` +
          `\`!join\` — Join your VC for 24/7 mode\n\n` +
          `**Queue**\n` +
          `\`!queue\` \`!q\` — Show queue\n` +
          `\`!nowplaying\` \`!np\` — Current track + progress\n` +
          `\`!shuffle\` — Shuffle the queue\n` +
          `\`!remove <pos>\` — Remove track by position\n` +
          `\`!clear\` — Clear entire queue\n\n` +
          `**Settings**\n` +
          `\`!volume <0-100>\` — Set volume\n` +
          `\`!loop\` — Toggle track loop\n` +
          `\`!loop queue\` — Loop entire queue\n` +
          `\`!loop autoplay\` — Autoplay related songs\n` +
          `\`!loop off\` — Disable all looping\n\n` +
          `📦 **Sources:** YouTube • Spotify • SoundCloud • Apple Music\n` +
          `🤖 **Multi-VC:** Works in multiple VCs at once across different servers!`,
      );
    },
  },
};

module.exports = commands;
