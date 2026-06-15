# Advika 🌸 — Discord AI Chatbot

Advika is a personality-driven Discord chatbot powered by **Google Gemini**. She's sarcastic, flirty, and talks in natural Hinglish. She remembers conversations, randomly jumps into chat, and replies when tagged or when someone replies to her.

---

## ✨ Features

| Feature          | Details                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| 🧠 Memory        | Remembers last ~15 messages per user per channel (SQLite)              |
| 🎭 Personality   | Roasty + Flirty Hinglish girl vibes                                    |
| 💬 Triggers      | Mentions (`@Advika`), replies to her messages, random 4% ambient jumps |
| 🔄 Context       | Sees recent channel convo before responding                            |
| 📊 User Profiles | Tracks roast/flirt counts to keep tone consistent per user             |
| 🌐 Render Ready  | Keep-alive server + 14-min self-ping cron                              |

---

## 🛠️ Setup

### 1. Clone & Install

```bash
git clone <your-repo>
cd advika-bot
npm install
```

### 2. Create `.env`

```bash
cp .env.example .env
```

Fill in:

- `DISCORD_TOKEN` → from [Discord Developer Portal](https://discord.com/developers/applications)
- `GEMINI_API_KEY` → from [Google AI Studio](https://aistudio.google.com/)
- `RENDER_URL` → your Render service URL after deployment

### 3. Discord Bot Permissions

In Discord Developer Portal, your bot needs these **Privileged Intents**:

- ✅ `MESSAGE CONTENT INTENT`
- ✅ `SERVER MEMBERS INTENT`

Bot permissions needed:

- `Read Messages / View Channels`
- `Send Messages`
- `Read Message History`

### 4. Run Locally

```bash
npm run dev
```

---

## 🚀 Deploy to Render

1. Push to GitHub
2. Create a new **Web Service** on Render
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in Render dashboard
6. Set `RENDER_URL` to your Render service URL

> **Note:** SQLite DB is stored in `data/advika.db` — this resets on Render redeploys. For persistence, upgrade to Render's persistent disk or use Railway/Neon PostgreSQL.

---

## 🎛️ How Advika Responds

```
User mentions @Advika  →  Always responds
User replies to Advika →  Always responds
Random message in channel → ~4% chance (goes up if message has ? or is longer)
```

She saves every message she sees to build context, even if she doesn't respond.

---

## 📁 Project Structure

```
advika-bot/
├── src/
│   ├── index.js              # Entry point
│   ├── ai/
│   │   └── gemini.js         # Gemini API + personality prompt
│   ├── db/
│   │   └── index.js          # SQLite schema + queries
│   ├── events/
│   │   └── messageCreate.js  # Message trigger logic
│   └── utils/
│       └── keepAlive.js      # Express server + cron ping
├── data/                     # Auto-created, stores advika.db
├── .env.example
└── package.json
```

---

## 🔧 Tuning

**Change random response rate** → `src/ai/gemini.js`, `shouldRandomlyRespond()` function:

```js
let chance = 0.04; // 4% base → change this
```

**Change memory depth** → `src/events/messageCreate.js`:

```js
const history = getUserHistory(guild_id, channel_id, user_id, 12); // 12 messages
```

**Change her personality** → `src/ai/gemini.js`, `SYSTEM_PROMPT` constant.
