import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../data/advika.db");

// Ensure data directory exists
import fs from "fs";
fs.mkdirSync(path.join(__dirname, "../../data"), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance on Render
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    username    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    created_at  DATETIME DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_user_guild 
    ON messages(guild_id, channel_id, user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id     TEXT NOT NULL,
    guild_id    TEXT NOT NULL,
    username    TEXT NOT NULL,
    nickname    TEXT,
    roast_count INTEGER DEFAULT 0,
    flirt_count INTEGER DEFAULT 0,
    last_seen   DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, guild_id)
  );
`);

// ─── Prepared Statements ──────────────────────────────────────────────────────

const insertMessage = db.prepare(`
  INSERT INTO messages (guild_id, channel_id, user_id, username, role, content)
  VALUES (@guild_id, @channel_id, @user_id, @username, @role, @content)
`);

// Get last N messages for a user in a channel — used to build Gemini context
const getHistory = db.prepare(`
  SELECT role, content, username
  FROM messages
  WHERE guild_id = @guild_id
    AND channel_id = @channel_id
    AND user_id = @user_id
  ORDER BY created_at DESC
  LIMIT @limit
`);

// Get recent channel messages (multi-user context for random replies)
const getChannelHistory = db.prepare(`
  SELECT role, content, username, user_id
  FROM messages
  WHERE guild_id = @guild_id
    AND channel_id = @channel_id
  ORDER BY created_at DESC
  LIMIT @limit
`);

const upsertProfile = db.prepare(`
  INSERT INTO user_profiles (user_id, guild_id, username, last_seen)
  VALUES (@user_id, @guild_id, @username, datetime('now'))
  ON CONFLICT(user_id, guild_id) DO UPDATE SET
    username = @username,
    last_seen = datetime('now')
`);

const incrementRoast = db.prepare(`
  UPDATE user_profiles SET roast_count = roast_count + 1 
  WHERE user_id = @user_id AND guild_id = @guild_id
`);

const incrementFlirt = db.prepare(`
  UPDATE user_profiles SET flirt_count = flirt_count + 1 
  WHERE user_id = @user_id AND guild_id = @guild_id
`);

const getProfile = db.prepare(`
  SELECT * FROM user_profiles WHERE user_id = @user_id AND guild_id = @guild_id
`);

// Cleanup old messages (keep last 200 per user per channel)
const cleanupOld = db.prepare(`
  DELETE FROM messages
  WHERE id NOT IN (
    SELECT id FROM messages
    WHERE guild_id = @guild_id AND channel_id = @channel_id AND user_id = @user_id
    ORDER BY created_at DESC
    LIMIT 200
  )
  AND guild_id = @guild_id AND channel_id = @channel_id AND user_id = @user_id
`);

// ─── Exported Functions ───────────────────────────────────────────────────────

export function saveMessage({ guild_id, channel_id, user_id, username, role, content }) {
  insertMessage.run({ guild_id, channel_id, user_id, username, role, content });
  // Cleanup old messages periodically (1 in 20 chance)
  if (Math.random() < 0.05) {
    cleanupOld.run({ guild_id, channel_id, user_id });
  }
}

/**
 * Returns conversation history for a user in a channel as Gemini-ready turns.
 * Returns in chronological order (oldest first).
 */
export function getUserHistory(guild_id, channel_id, user_id, limit = 15) {
  const rows = getHistory.all({ guild_id, channel_id, user_id, limit });
  return rows.reverse(); // DB returns newest first, we need oldest first
}

/**
 * Returns recent channel messages for ambient/random context.
 */
export function getRecentChannelContext(guild_id, channel_id, limit = 10) {
  const rows = getChannelHistory.all({ guild_id, channel_id, limit });
  return rows.reverse();
}

export function updateProfile({ user_id, guild_id, username }) {
  upsertProfile.run({ user_id, guild_id, username });
}

export function getUserProfile(user_id, guild_id) {
  return getProfile.get({ user_id, guild_id });
}

export function bumpRoast(user_id, guild_id) {
  incrementRoast.run({ user_id, guild_id });
}

export function bumpFlirt(user_id, guild_id) {
  incrementFlirt.run({ user_id, guild_id });
}

export default db;
