import {
  saveMessage,
  getUserHistory,
  getRecentChannelContext,
  updateProfile,
  bumpRoast,
  bumpFlirt,
} from "../db/index.js";
import {
  getAdvikaReply,
  shouldRandomlyRespond,
  getTypingDelay,
} from "../ai/gemini.js";

function classifyReply(text) {
  const roastWords = [
    "yaar",
    "bhai",
    "seriously",
    "pagal",
    "cringe",
    "really",
    "lmao",
    "😭",
    "🙄",
  ];
  const flirtWords = [
    "cute",
    "aww",
    "btw",
    "💀",
    "😏",
    "😌",
    "accha",
    "nice try",
    "impressive",
  ];
  const lower = text.toLowerCase();
  const roastScore = roastWords.filter((w) => lower.includes(w)).length;
  const flirtScore = flirtWords.filter((w) => lower.includes(w)).length;
  if (roastScore > flirtScore) return "roast";
  if (flirtScore > roastScore) return "flirt";
  return null;
}

const recentResponses = new Map();

function isRateLimited(channelId, cooldownMs = 3000) {
  const last = recentResponses.get(channelId);
  if (last && Date.now() - last < cooldownMs) return true;
  recentResponses.set(channelId, Date.now());
  return false;
}

const advikaSentMessages = new Set();

export function trackSentMessage(messageId) {
  advikaSentMessages.add(messageId);
  setTimeout(() => advikaSentMessages.delete(messageId), 30 * 60 * 1000);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleChatMessage(message, client) {
  if (message.author.bot) return;

  const guild_id = message.guild?.id;
  const channel_id = message.channel.id;
  const user_id = message.author.id;
  const username = message.member?.displayName || message.author.username;
  const content = message.content;

  const isMentioned = message.mentions.has(client.user.id);
  const isReplyToAdvika =
    message.reference?.messageId &&
    advikaSentMessages.has(message.reference.messageId);
  const isRandomTrigger =
    !isMentioned && !isReplyToAdvika && shouldRandomlyRespond(message);

  if (!isMentioned && !isReplyToAdvika && !isRandomTrigger) {
    if (!content.startsWith("!") && content.length > 2) {
      updateProfile({ user_id, guild_id, username });
      saveMessage({
        guild_id,
        channel_id,
        user_id,
        username,
        role: "user",
        content,
      });
    }
    return;
  }

  if (isRateLimited(channel_id)) return;

  let cleanContent = content.replace(/<@!?[0-9]+>/g, "").trim();
  if (!cleanContent && isMentioned)
    cleanContent = "[just mentioned me with no text]";

  updateProfile({ user_id, guild_id, username });
  saveMessage({
    guild_id,
    channel_id,
    user_id,
    username,
    role: "user",
    content: cleanContent,
  });

  const history = getUserHistory(guild_id, channel_id, user_id, 8);
  const recentChannelMsgs = getRecentChannelContext(guild_id, channel_id, 8);

  try {
    // Start typing immediately
    await message.channel.sendTyping();

    const reply = await getAdvikaReply({
      guild_id,
      channel_id,
      user_id,
      username,
      currentMessage: cleanContent,
      history: history.slice(0, -1),
      recentChannelMsgs,
      isRandom: isRandomTrigger,
    });

    // ── null = quota exhausted, go silent ────────────────────────────────
    if (reply === null) {
      console.log(`[Advika] Quota exhausted — not replying to ${username}`);
      return;
    }

    // ── Natural typing delay based on reply length ────────────────────────
    const delay = getTypingDelay(reply);
    await message.channel.sendTyping(); // refresh typing indicator
    await new Promise((r) => setTimeout(r, delay));

    // ── Send reply ────────────────────────────────────────────────────────
    let sentMsg;
    if (isRandomTrigger) {
      sentMsg = await message.channel.send(reply);
    } else {
      sentMsg = await message.reply({
        content: reply,
        allowedMentions: { repliedUser: true },
      });
    }

    trackSentMessage(sentMsg.id);

    saveMessage({
      guild_id,
      channel_id,
      user_id,
      username: "Advika",
      role: "assistant",
      content: reply,
    });

    const mood = classifyReply(reply);
    if (mood === "roast") bumpRoast(user_id, guild_id);
    if (mood === "flirt") bumpFlirt(user_id, guild_id);
  } catch (error) {
    console.error("[Advika AI Error]:", error.message);
    if (!isRandomTrigger) {
      await message
        .reply("arre mera dimag thoda hang hua, ek second 😭")
        .catch(() => {});
    }
  }
}
