// src/utils/QueueManager.js
// Streams audio via yt-dlp (youtube-dl-exec) — bypasses all YouTube bot-detection/403 issues
// FFmpeg path is explicitly set from ffmpeg-static

const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
  StreamType,
  NoSubscriberBehavior,
} = require("@discordjs/voice");

const youtubedl = require("youtube-dl-exec");
const { PassThrough } = require("stream");
const play = require("play-dl");

// ─── Explicitly set FFmpeg path so @discordjs/voice finds it ──────────────────
process.env.FFMPEG_PATH = require("ffmpeg-static");

class GuildQueue {
  constructor(guildId, voiceChannel, textChannel) {
    this.guildId = guildId;
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;
    this.tracks = [];
    this.currentTrack = null;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    this.connection = null;
    this.volume = 0.5;
    this.loop = false;
    this.loopQueue = false;
    this.playing = false;
    this.paused = false;
    this._currentProcess = null;

    this._setupPlayerEvents();
  }

  _setupPlayerEvents() {
    this.player.on("stateChange", (oldState, newState) => {
      console.log(`[Player] ${oldState.status} -> ${newState.status}`);
    });
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.playing = false;
      if (this.loop && this.currentTrack) {
        this._play(this.currentTrack);
      } else {
        if (this.loopQueue && this.currentTrack) {
          this.tracks.push(this.currentTrack);
        }
        this._playNext();
      }
    });

    this.player.on("error", (error) => {
      console.error(`[Player Error] Guild ${this.guildId}:`, error.message);
      this.textChannel.send(`⚠️ Player error, skipping...`).catch(() => {});
      this._playNext();
    });
  }

  async connect(voiceChannel) {
    this.voiceChannel = voiceChannel;

    if (this.connection) {
      try {
        this.connection.destroy();
      } catch (_) {}
    }

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
      this.connection.subscribe(this.player);
      console.log(
        `[Voice] Connected to "${voiceChannel.name}" in guild ${this.guildId}`,
      );
    } catch (err) {
      console.error("[Voice] Failed to reach Ready state:", err);
      this.connection.destroy();
      throw new Error("Failed to join voice channel. Try again.");
    }

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });
  }

  async addTrack(track) {
    this.tracks.push(track);
    if (!this.playing && !this.paused) {
      await this._playNext();
    }
  }

  async _playNext() {
    if (this.tracks.length === 0) {
      this.currentTrack = null;
      this.playing = false;
      this.textChannel
        .send("✅ Queue finished! Add more songs with `!play <song>`")
        .catch(() => {});
      return;
    }
    const next = this.tracks.shift();
    await this._play(next);
  }

  async _play(track) {
    try {
      this.currentTrack = track;
      this.playing = true;
      this.paused = false;

      console.log(`[Play] Streaming: ${track.title}`);

      // Kill any previous yt-dlp process
      // if (this._currentProcess) {
      //   try {
      //     this._currentProcess.kill();
      //   } catch (_) {}
      //   this._currentProcess = null;
      // }
      console.log("TRACK URL:", track.url);
      const video = await play.video_basic_info(track.url);

      console.log("VIDEO TITLE:", video.video_details.title);

      const stream = await play.stream(
        `https://www.youtube.com/watch?v=${video.video_details.id}`,
      );
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: true,
      });

      resource.volume?.setVolume(this.volume);
      this.player.play(resource);
      console.log("Current player state:", this.player.state.status);
      this.textChannel
        .send(
          `🎵 **Now Playing:** [${track.title}](${track.url})\n` +
            `⏱ Duration: \`${track.duration}\` | 👤 Requested by: ${track.requestedBy}`,
        )
        .catch(() => {});
    } catch (err) {
      console.error(`[Play Error] Guild ${this.guildId}:`, err.message);
      this.textChannel
        .send(`⚠️ Could not play \`${track.title}\`. Skipping...`)
        .catch(() => {});
      this._playNext();
    }
  }

  skip() {
    // if (this._currentProcess) {
    //   try {
    //     this._currentProcess.kill();
    //   } catch (_) {}
    //   this._currentProcess = null;
    // }
    this.player.stop();
  }

  pause() {
    this.player.pause();
    this.paused = true;
    this.playing = false;
  }

  resume() {
    this.player.unpause();
    this.paused = false;
    this.playing = true;
  }

  setVolume(vol) {
    this.volume = vol / 100;
    if (this.player.state?.resource?.volume) {
      this.player.state.resource.volume.setVolume(this.volume);
    }
  }

  getQueueEmbed() {
    if (!this.currentTrack && this.tracks.length === 0)
      return "📭 Queue is empty!";
    let msg = "";
    if (this.currentTrack) {
      msg += `**Now Playing:** 🎵 ${this.currentTrack.title} | \`${this.currentTrack.duration}\`\n\n`;
    }
    if (this.tracks.length > 0) {
      msg += `**Up Next:**\n`;
      this.tracks.slice(0, 10).forEach((t, i) => {
        msg += `\`${i + 1}.\` ${t.title} | \`${t.duration}\`\n`;
      });
      if (this.tracks.length > 10)
        msg += `\n...and ${this.tracks.length - 10} more tracks`;
    }
    msg += `\n🔁 Loop: \`${this.loop ? "ON" : "OFF"}\` | 🔁 Queue Loop: \`${this.loopQueue ? "ON" : "OFF"}\` | 🔊 Volume: \`${Math.round(this.volume * 100)}%\``;
    return msg;
  }

  destroy() {
    this.tracks = [];
    this.currentTrack = null;
    this.playing = false;
    // if (this._currentProcess) {
    //   try {
    //     this._currentProcess.kill();
    //   } catch (_) {}
    //   this._currentProcess = null;
    // }
    try {
      this.player.stop();
    } catch (_) {}
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch (_) {}
      this.connection = null;
    }
  }
}

class QueueManager {
  constructor() {
    this.queues = new Map();
  }
  get(guildId) {
    return this.queues.get(guildId) || null;
  }
  create(guildId, voiceChannel, textChannel) {
    const q = new GuildQueue(guildId, voiceChannel, textChannel);
    this.queues.set(guildId, q);
    return q;
  }
  getOrCreate(guildId, voiceChannel, textChannel) {
    return (
      this.queues.get(guildId) ||
      this.create(guildId, voiceChannel, textChannel)
    );
  }
  delete(guildId) {
    const q = this.queues.get(guildId);
    if (q) q.destroy();
    this.queues.delete(guildId);
  }
  has(guildId) {
    return this.queues.has(guildId);
  }
}

module.exports = new QueueManager();
