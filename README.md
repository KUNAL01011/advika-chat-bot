# Aurix Music Bot

A Discord music bot powered by discord-player v6 + YoutubeiExtractor.
Multi-VC, 24/7, hosted on Render free tier.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your DISCORD_TOKEN in .env
npm start
```

## Features

- YouTube
- 24/7 VC mode (bot stays even when queue is empty)
- Multiple VCs simultaneously across different servers
- Loop track / loop queue / autoplay
- Shuffle, remove, clear queue
- Volume control + progress bar

## Commands

| Command           | Aliases      | Description                  |
| ----------------- | ------------ | ---------------------------- |
| `!play <query>`   | `!p`         | Play song         |
| `!skip`           | `!s` `!next` | Skip current track           |
| `!pause`          | —            | Pause playback               |
| `!resume`         | `!r`         | Resume playback              |
| `!stop`           | —            | Stop + clear queue           |
| `!dc`             | `!leave`     | Disconnect from VC           |
| `!join`           | `!j`         | Join VC (24/7 mode)          |
| `!queue`          | `!q`         | Show queue                   |
| `!nowplaying`     | `!np`        | Current track + progress bar |
| `!volume <0-100>` | `!vol`       | Set volume                   |
| `!loop`           | `!repeat`    | Toggle track loop            |
| `!loop queue`     | —            | Loop entire queue            |
| `!loop autoplay`  | —            | Autoplay related songs       |
| `!loop off`       | —            | Disable looping              |
| `!shuffle`        | —            | Shuffle queue                |
| `!remove <pos>`   | `!rm`        | Remove track by position     |
| `!clear`          | —            | Clear queue                  |
| `!help`           | `!h`         | Show all commands            |

## Folder Structure

```
src/
  index.js              # Entry point, player setup
  events/
    ready.js            # Bot ready event
    messageCreate.js    # Command router
    playerEvents.js     # Now Playing, Queue End, errors
  commands/
    play.js             # !play command
    controls.js         # All other commands
  utils/
    keepAlive.js        # Express server + cron for Render
```
!play https://open.spotify.com/playlist/74va6gtweFPjNjRM8pLBbM
!play https://open.spotify.com/track/2JzZzZUQj3Qff7wapcbKjc
!play https://www.youtube.com/playlist?list=PL__GQ-SJLZE_zZruVwNS8xSeK6xYPAdh5
!play https://www.youtube.com/watch?v=dQw4w9WgXcQ
!play never gonna give you up