import { useQueue, QueueRepeatMode } from "discord-player";

// Map aliases back to base commands
const aliases = {
  p: "play",
  s: "skip",
  next: "skip",
  r: "resume",
  leave: "dc",
  j: "join",
  q: "queue",
  np: "nowplaying",
  vol: "volume",
  repeat: "loop",
  rm: "remove",
  h: "help",
};

export const executeCommand = async (commandName, message, args, player) => {
  // Resolve alias, or use original commandName
  const cmd = aliases[commandName] || commandName;
  const vc = message.member?.voice?.channel;

  // Most commands require a queue, let's grab it early.
  const queue = useQueue(message.guild.id);

  try {
    switch (cmd) {
      case "join": {
        if (!vc) return message.reply("❌ Join a Voice Channel first!");

        // Setup node for 24/7 staying
        const newQueue = player.nodes.create(message.guild, {
          metadata: { channel: message.channel },
          leaveOnEmpty: false,
          leaveOnEnd: false,
        });

        await newQueue.connect(vc);
        return message.reply("✅ Joined VC and ready to play 24/7!");
      }

      case "dc": {
        if (!queue) return message.reply("❌ I'm not in a Voice Channel.");
        queue.delete();
        return message.reply("👋 Left the VC.");
      }

      case "play": {
        if (!vc) return message.reply("❌ Join a Voice Channel first!");
        if (!args.length) return message.reply("❌ Give me a song to play!");

        const query = args.join(" ");
        await message.reply(`🔍 Searching for \`${query}\`...`);

        // We wrap in try-catch to safely fallback if playlist/Spotify acts up
        try {
          await player.play(vc, query, {
            nodeOptions: {
              metadata: { channel: message.channel },
              leaveOnEmpty: false, // Enforces 24/7 mode
              leaveOnEnd: false,
            },
          });
        } catch (error) {
          console.error(error);
          return message.channel.send(`❌ Failed to play: ${error.message}`);
        }
        break;
      }

      case "skip": {
        if (!queue || !queue.isPlaying())
          return message.reply("❌ Nothing playing right now.");
        queue.node.skip();
        return message.reply("⏭️ Skipped!");
      }

      case "pause": {
        if (!queue || !queue.isPlaying())
          return message.reply("❌ Nothing playing.");
        queue.node.setPaused(true);
        return message.reply("⏸️ Paused!");
      }

      case "resume": {
        if (!queue || !queue.isPlaying())
          return message.reply("❌ Nothing to resume.");
        queue.node.setPaused(false);
        return message.reply("▶️ Resumed!");
      }

      case "stop": {
        if (!queue) return message.reply("❌ Nothing playing.");
        queue.tracks.clear();
        queue.node.stop();
        return message.reply("🛑 Stopped and cleared queue!");
      }

      case "queue": {
        if (!queue || queue.tracks.data.length === 0)
          return message.reply("❌ Queue is empty.");

        const tracks = queue.tracks
          .toArray()
          .slice(0, 10)
          .map((t, i) => `${i + 1}. ${t.title}`);
        return message.reply(
          `**Upcoming Queue:**\n${tracks.join("\n")}${queue.tracks.data.length > 10 ? `\n*...and ${queue.tracks.data.length - 10} more*` : ""}`,
        );
      }

      case "nowplaying": {
        if (!queue || !queue.currentTrack)
          return message.reply("❌ Nothing playing.");
        const progress = queue.node.createProgressBar();
        return message.reply(
          `🎵 **Now Playing:** ${queue.currentTrack.title}\n${progress}`,
        );
      }

      case "volume": {
        if (!queue) return message.reply("❌ Nothing playing.");
        const vol = parseInt(args[0]);
        if (!vol || vol < 0 || vol > 100)
          return message.reply("❌ Provide a valid volume between 0 and 100.");

        queue.node.setVolume(vol);
        return message.reply(`🔊 Volume set to **${vol}%**`);
      }

      case "loop": {
        if (!queue) return message.reply("❌ Nothing playing.");
        const mode = args[0]?.toLowerCase();

        if (mode === "queue") {
          queue.setRepeatMode(QueueRepeatMode.QUEUE);
          return message.reply("🔁 Loop set to: **Queue**");
        } else if (mode === "autoplay") {
          queue.setRepeatMode(QueueRepeatMode.AUTOPLAY);
          return message.reply("📻 Loop set to: **Autoplay**");
        } else if (mode === "off") {
          queue.setRepeatMode(QueueRepeatMode.OFF);
          return message.reply("➡️ Loop set to: **Off**");
        } else {
          queue.setRepeatMode(QueueRepeatMode.TRACK);
          return message.reply("🔂 Loop set to: **Current Track**");
        }
      }

      case "shuffle": {
        if (!queue || queue.tracks.data.length === 0)
          return message.reply("❌ Queue is empty.");
        queue.tracks.shuffle();
        return message.reply("🔀 Queue shuffled!");
      }

      case "remove": {
        if (!queue || queue.tracks.data.length === 0)
          return message.reply("❌ Queue is empty.");
        const index = parseInt(args[0]) - 1;
        if (isNaN(index) || index < 0 || index >= queue.tracks.data.length)
          return message.reply(
            "❌ Provide a valid track number from the queue!",
          );

        const trackName = queue.tracks.data[index].title;
        queue.removeTrack(index);
        return message.reply(`🗑️ Removed **${trackName}** from queue.`);
      }

      case "clear": {
        if (!queue || queue.tracks.data.length === 0)
          return message.reply("❌ Queue is already empty.");
        queue.tracks.clear();
        return message.reply("🧹 Cleared the queue!");
      }

      case "help": {
        const helpText = `
**🎵 Aurix Music Commands**
\`!play <query>\` (or \`!p\`) - Play a song/link
\`!skip\` (or \`!s\`, \`!next\`) - Skip track
\`!pause\` / \`!resume\` (or \`!r\`) - Control playback
\`!stop\` - Stop and clear
\`!dc\` / \`!join\` - Manage bot in VC (24/7)
\`!queue\` (or \`!q\`) - Show upcoming songs
\`!nowplaying\` (or \`!np\`) - See current song & progress
\`!volume <0-100>\` (or \`!vol\`) - Adjust volume
\`!loop [queue|autoplay|off]\` - Looping controls
\`!shuffle\` - Mix it up
\`!remove <pos>\` (or \`!rm\`) - Remove track by number
\`!clear\` - Empty the queue
        `;
        return message.reply(helpText);
      }
    }
  } catch (err) {
    console.error(`Error executing ${cmd}:`, err);
    message.reply("❌ Something went wrong executing that command.");
  }
};
