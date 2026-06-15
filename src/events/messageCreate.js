import {
  saveMessage,
  getUserHistory,
  getRecentChannelContext,
  updateProfile,
  bumpRoast,
  bumpFlirt,
} from "../db/index.js";
import { getAdvikaReply, shouldRandomlyRespond } from "../ai/gemini.js";

// Simple heuristic: does the reply look more roasty or flirty?
function classifyReply(text) {
  const roastWords = ["yaar", "bhai", "seriously", "pagal", "cringe", "really", "lmao", "😭", "🙄"];
  const flirtWords = ["cute", "aww", "btw", "💀", "😏", "😌", "accha", "nice try", "impressive"];

  const lower = text.toLowerCase();
  const roastScore = roastWords.filter(w => lower.includes(w)).length;
  const flirtScore = flirtWords.filter(w => lower.includes(w)).length;

  if (roastScore > flirtScore) return "roast";
  if (flirtScore > roastScore) return "flirt";
  return null;
}

// Rate limiting: track recent responses per channel to avoid spam
const recentResponses = new Map(); // channelId -> last response timestamp

function isRateLimited(channelId, cooldownMs = 3000) {
  const last = recentResponses.get(channelId);
  if (last && Date.now() - last < cooldownMs) return true;
  recentResponses.set(channelId, Date.now());
  return false;
}

// Track messages Advika sent so we can detect replies to her
const advikaSentMessages = new Set(); // message IDs

export function trackSentMessage(messageId) {
  advikaSentMessages.add(messageId);
  // Cleanup after 30 minutes to prevent memory leak
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

  // ── Determine trigger type ────────────────────────────────────────────────

  const isMentioned = message.mentions.has(client.user.id);
  const isReplyToAdvika =
    message.reference?.messageId &&
    advikaSentMessages.has(message.reference.messageId);

  const isRandomTrigger = !isMentioned && !isReplyToAdvika && shouldRandomlyRespond(message);

  // Only proceed if it's one of the three trigger types
  if (!isMentioned && !isReplyToAdvika && !isRandomTrigger) {
    // Still save user messages to DB for context (even when not responding)
    if (!content.startsWith("!") && content.length > 2) {
      updateProfile({ user_id, guild_id, username });
      saveMessage({ guild_id, channel_id, user_id, username, role: "user", content });
    }
    return;
  }

  // Rate limit check
  if (isRateLimited(channel_id)) return;

  // ── Prepare context ───────────────────────────────────────────────────────

  // Clean up the mention from message text if present
  let cleanContent = content
    .replace(/<@!?[0-9]+>/g, "")
    .trim();

  if (!cleanContent && isMentioned) {
    cleanContent = "[just mentioned me with no text]";
  }

  // Update user profile
  updateProfile({ user_id, guild_id, username });

  // Save incoming user message
  saveMessage({
    guild_id,
    channel_id,
    user_id,
    username,
    role: "user",
    content: cleanContent,
  });

  // Fetch conversation history with this user
  const history = getUserHistory(guild_id, channel_id, user_id, 12);

  // Fetch recent channel context for ambient awareness
  const recentChannelMsgs = getRecentChannelContext(guild_id, channel_id, 8);

  // ── Get AI reply ──────────────────────────────────────────────────────────

  try {
    // Show typing indicator
    await message.channel.sendTyping();

    const reply = await getAdvikaReply({
      guild_id,
      channel_id,
      user_id,
      username,
      currentMessage: cleanContent,
      history: history.slice(0, -1), // exclude the message we just saved (it's the current one)
      recentChannelMsgs,
      isRandom: isRandomTrigger,
    });

    // ── Send the reply ────────────────────────────────────────────────────────
    let sentMsg;

    if (isRandomTrigger) {
      // Random responses: just send in channel without replying to specific message
      sentMsg = await message.channel.send(reply);
    } else {
      // Mentions and reply-chains: reply to the specific message
      sentMsg = await message.reply({ content: reply, allowedMentions: { repliedUser: true } });
    }

    // Track this message so we can detect replies to it
    trackSentMessage(sentMsg.id);

    // ── Save Advika's reply to DB ─────────────────────────────────────────────
    saveMessage({
      guild_id,
      channel_id,
      user_id,
      username: "Advika",
      role: "assistant",
      content: reply,
    });

    // ── Update mood stats ──────────────────────────────────────────────────────
    const mood = classifyReply(reply);
    if (mood === "roast") bumpRoast(user_id, guild_id);
    if (mood === "flirt") bumpFlirt(user_id, guild_id);

  } catch (error) {
    console.error("[Advika AI Error]:", error.message);
    // Silent fail for random triggers — don't expose errors for unprompted jumps
    if (!isRandomTrigger) {
      await message.reply("arre mera dimag thoda hang hua, ek second 😭").catch(() => {});
    }
  }
}
