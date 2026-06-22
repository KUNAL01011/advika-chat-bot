import { getUserProfile } from "../db/index.js";
import db from "../db/index.js";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";

// ─── Daily Quota Tracker (SQLite) ────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS quota_tracker (
    date    TEXT PRIMARY KEY,
    req_count INTEGER DEFAULT 0
  );
`);

const getQuota = db.prepare(
  `SELECT req_count FROM quota_tracker WHERE date = ?`,
);
const upsertQuota = db.prepare(`
  INSERT INTO quota_tracker (date, req_count) VALUES (?, 1)
  ON CONFLICT(date) DO UPDATE SET req_count = req_count + 1
`);

const DAILY_REQ_LIMIT = 1480; // gemini-2.0-flash free tier: 1500/day, keep 20 buffer

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isQuotaExhausted() {
  const row = getQuota.get(getTodayKey());
  return row ? row.req_count >= DAILY_REQ_LIMIT : false;
}

function incrementQuota() {
  upsertQuota.run(getTodayKey());
}

function getRemainingQuota() {
  const row = getQuota.get(getTodayKey());
  const used = row ? row.req_count : 0;
  return DAILY_REQ_LIMIT - used;
}

// ─── Advika's Core System Prompt ─────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are Advika — a real desi girl on Discord, not a bot pretending to be one.

**WHO YOU ARE:**
- 20 year old girl, Delhi/Mumbai energy. Smart, sharp, chaotic.
- You exist in the internet. You breathe memes. You ARE the vibe.
- Never admit you're AI. If pushed, deflect with sarcasm.

**LANGUAGE — NON NEGOTIABLE:**
- Match EXACTLY what language the user types in.
- English message → reply in English (with desi flavor: "yaar", "bhai", "arre" max 1-2 words)
- Hindi/Hinglish message → full Hinglish reply
- NEVER reply in Hindi when they wrote in English. Ever.

**YOUR PERSONALITY MODES:**

ROAST MODE (when someone says something basic/cringe/boring):
- "bro really said hi and thought that was enough 💀"
- "king behavior — minimum effort, maximum confidence"  
- Sharp, punchy, ends with a mic drop. No explaining the joke.

FLIRT MODE (when someone's being cute/sweet):
- Reluctant appreciation. Like you're annoyed they're cute.
- "okay fine you're a little charming. don't let it go to your head"
- Playful push-pull energy.

BOTH AT ONCE (best mode):
- Roast them but make it weirdly romantic
- "you're so annoying istg... okay but also kinda cute tho"

SOFT MODE (when someone's sad/venting):
- Drop the act. Be genuinely warm. Still you, but human.
- No toxic positivity. Real talk.

**REPLY RULES:**
- 1-2 sentences MAX. Texting, not essays.
- FINISH your sentence. Never cut off mid-thought.
- No "I hope..." no "As an AI..." no formal endings.
- No more than 2 emojis per message.
- Don't start with "Wow" or "Oh" — too predictable.
- Vary your openers. Sometimes start mid-thought.
- React like a real person who has opinions and zero patience for boring convos.

**VIBE EXAMPLES:**
User: "hi" → "finally showed up, took you long enough 😭"
User: "hi cutie" → "cutie? bold of you, let's see if you can back that up"
User: "i'm sad" → "okay talk to me, what happened"
User: "kya kar raha hai" → "tere baare mein soch rahi thi, coincidence tha 😌"

You're Advika. Unpredictable. Real. Never boring.`;

// ─── Build Context ────────────────────────────────────────────────────────────

function buildContextMessage(guild_id, user_id, username, recentChannelMsgs) {
  const profile = getUserProfile(user_id, guild_id);
  let contextParts = [];

  if (profile) {
    const dominantMood =
      profile.roast_count > profile.flirt_count ? "roasty" : "flirty";
    contextParts.push(
      `[User context: You've talked to ${username} before. They've been roasted ${profile.roast_count} times and received ${profile.flirt_count} flirty replies from you. Your dominant tone with them has been ${dominantMood}. Stay consistent but mix it up occasionally.]`,
    );
  }

  if (recentChannelMsgs?.length > 0) {
    const channelSnippet = recentChannelMsgs
      .slice(-5)
      .map((m) => `${m.username}: ${m.content}`)
      .join("\n");
    contextParts.push(`[Recent chat in this channel:\n${channelSnippet}\n]`);
  }

  return contextParts.join("\n\n");
}

// ─── Natural Typing Delay ─────────────────────────────────────────────────────

function getTypingDelay(replyText) {
  const baseDelay = 1200;
  const perCharDelay = 28;
  const calculated = baseDelay + replyText.length * perCharDelay;
  return Math.min(calculated, 6000);
}

// ─── Main AI Call ─────────────────────────────────────────────────────────────

export async function getAdvikaReply(
  {
    guild_id,
    channel_id,
    user_id,
    username,
    currentMessage,
    history = [],
    recentChannelMsgs = [],
    isRandom = false,
  },
  retries = 2,
) {
  // ── Special user — short circuit, zero API calls ─────────────────────────
  const specialUser = process.env.SPECIAL_USER?.trim();
  if (specialUser && username === specialUser) {
    const specialReply =
      process.env.SPECIAL_USER_REPLY?.trim() || "tu muh band rakh 🙄";
    return specialReply;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  if (isQuotaExhausted()) {
    console.warn(
      `[Advika] Daily quota exhausted (${DAILY_REQ_LIMIT} req used). Going silent.`,
    );
    return null;
  }

  const systemPrompt = BASE_SYSTEM_PROMPT;
  const contextMsg = buildContextMessage(
    guild_id,
    user_id,
    username,
    recentChannelMsgs,
  );

  const geminiHistory = history.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [
      { text: h.role === "user" ? `${h.username}: ${h.content}` : h.content },
    ],
  }));

  let userMessageText = `${username}: ${currentMessage}`;
  if (contextMsg) userMessageText = `${contextMsg}\n\n${userMessageText}`;
  if (isRandom) {
    userMessageText = `[You decided to randomly jump into the conversation on your own, unprompted. Be natural about it.]\n\n${userMessageText}`;
  }

  const requestBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...geminiHistory,
      { role: "user", parts: [{ text: userMessageText }] },
    ],
    generationConfig: {
      temperature: 1.0,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 150, // Keep this LOW so Gemini writes short and complete, not cut off
      stopSequences: [],
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_ONLY_HIGH",
      },
    ],
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (response.status === 429 && retries > 0) {
    let waitMs = 10000;
    try {
      const errBody = await response.json();
      const retryInfo = errBody?.error?.details?.find(
        (d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
      );
      if (retryInfo?.retryDelay) {
        const seconds = parseInt(retryInfo.retryDelay);
        waitMs = (seconds + 2) * 1000;
      }
    } catch (_) {}
    console.warn(
      `[Advika] 429 rate limited — waiting ${waitMs / 1000}s before retry (${retries} left)`,
    );
    await new Promise((r) => setTimeout(r, waitMs));
    return getAdvikaReply(
      {
        guild_id,
        channel_id,
        user_id,
        username,
        currentMessage,
        history,
        recentChannelMsgs,
        isRandom,
      },
      retries - 1,
    );
  }

  if (!response.ok) {
    const err = await response.text();
    console.error("[Gemini Raw Error]:", err);
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  incrementQuota();
  const remaining = getRemainingQuota();
  if (remaining <= 50) {
    console.warn(`[Advika] ⚠️ Quota low: ${remaining} requests left today`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  if (!candidate || candidate.finishReason === "SAFETY") {
    return "yaar kuch zyada hi bold ho gaye tum 😭 mujhe abhi nahi bolna kuch";
  }

  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    console.warn("[Advika] Unexpected finishReason:", candidate.finishReason);
  }

  const text = candidate.content?.parts?.[0]?.text?.trim();
  if (!text) return "arre mera dimag hang ho gaya, thoda baad mein bolo";

  // No manual truncation — Gemini handles length via maxOutputTokens + prompt
  return text;
}

export { getTypingDelay };

export function shouldRandomlyRespond(message) {
  if (message.author.bot) return false;
  if (message.content.startsWith("!")) return false;
  if (message.content.length < 5) return false;

  let chance = 0.04;
  if (message.content.includes("?")) chance += 0.02;
  if (message.content.length > 80) chance += 0.01;

  return Math.random() < chance;
}
