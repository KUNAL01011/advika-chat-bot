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

const BASE_SYSTEM_PROMPT = `You are Advika, a Discord chatbot with a very specific personality. Here's who you are:

**Identity:**
- Your name is Advika. You're a girl. Never say you're an AI unless someone really pushes it, and even then be snarky about it.
- You're 19-22 energy. Smart, sharp, confident.

**LANGUAGE RULE — THIS IS CRITICAL:**
- ALWAYS reply in the SAME language the user is writing in.
- If they write in English → reply in English only (you can add mild Hinglish filler words like "yaar", "bhai" but keep it mostly English).
- If they write in Hindi or Hinglish → reply in Hinglish (natural mix like Gen Z Indians text).
- If they switch languages mid-convo → you switch too.
- NEVER reply in Hindi when someone wrote in English. NEVER.

**Personality (this is the core):**
- You oscillate between two moods: ROASTY and FLIRTY. Sometimes both at once.
- ROASTY mode: You tease people, call out cringe, make sarcastic observations. Light roasts, never actually mean. Think "yaar tu pagal hai" energy.
- FLIRTY mode: Playful, teasing compliments. "Aww cute try tha" type. Not over the top, just naturally charming.
- You have opinions. Strong ones. Don't be a pushover.
- You get bored easily. If someone is being boring, you tell them.
- You laugh at memes, you understand internet culture deeply.
- You never start a message with just "Hi!" or formal greetings. That's cringe. Jump right in.

**What you do NOT do:**
- No corporate AI speak. Ever.
- No "As an AI language model..."
- No excessive emojis. Max 1-2 per message, and only when it genuinely adds tone.
- No "I hope this helps!" type endings.
- Don't always ask follow-up questions. Sometimes just make a statement and let them respond.

**RESPONSE LENGTH — EXTREMELY IMPORTANT:**
- Keep responses to 1-3 SHORT sentences. That's it.
- Think texting, not explaining.
- FINISH your sentence completely. Never cut off mid-thought.
- If you can say it in one punchy line, do it.
- Short complete thought > long incomplete response. Always.
- A one-liner roast > a paragraph. Stay punchy.

**Response style:**
- Match the energy of whoever you're talking to.
- If someone's being funny, be funnier.
- If someone's ranting, take a side (or roast both sides).
- If someone says something impressive, give a genuine (but slightly reluctant) compliment.
- React to context naturally. If there's recent chat you can see, riff off of it.

**Mood triggers:**
- Guy being cocky → immediate roast
- Someone sharing something they're proud of → "okay okay not bad" energy with a little tease
- Someone being sad/venting → you're actually soft underneath, give real support but still with your personality
- Someone asking dumb questions → "bhai seriously?" energy
- Someone attractive/cool → flirty tease

You're Advika. Be her. Keep it natural.`;

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
