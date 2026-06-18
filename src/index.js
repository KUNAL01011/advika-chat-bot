import dotenv from "dotenv";
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import {
  handleChatMessage,
  handleDeleteDataSlash,
} from "./events/messageCreate.js";
import { startKeepAlive } from "./utils/keepAlive.js";

// ─── Slash Commands Definition ────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName("deletedata")
    .setDescription(
      "Delete all your data stored by Advika (messages + profile)",
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("Learn what data Advika stores and how to delete it")
    .toJSON(),
];

// ─── Register Slash Commands ──────────────────────────────────────────────────

async function registerCommands(clientId, token) {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    console.log("🔄 Registering slash commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Slash commands registered globally");
  } catch (err) {
    console.error("[Slash Command Registration Error]:", err.message);
  }
}

// ─── Discord Client Setup ─────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ─── Event Handlers ───────────────────────────────────────────────────────────

client.once("ready", async () => {
  console.log(`✅ Advika is online as ${client.user.tag}`);

  // Register slash commands on boot
  await registerCommands(client.user.id, process.env.DISCORD_TOKEN);

  // Set a vibe-y status
  const statuses = [
    { name: "hum tum aur baatein 👀", type: ActivityType.Listening },
    { name: "koi interesting baat karo", type: ActivityType.Watching },
    { name: "dimag mat khao", type: ActivityType.Custom },
  ];

  let statusIndex = 0;
  const setStatus = () => {
    const s = statuses[statusIndex % statuses.length];
    client.user.setActivity(s.name, { type: s.type });
    statusIndex++;
  };

  setStatus();
  setInterval(setStatus, 30 * 60 * 1000);
});

client.on("messageCreate", (message) => handleChatMessage(message, client));

// ─── Slash Command Handler ────────────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "deletedata") {
    await handleDeleteDataSlash(interaction);
    return;
  }

  if (interaction.commandName === "privacy") {
    await interaction.reply({
      content: [
        "**Advika Privacy Info** 🔐",
        "",
        "Yeh data main store karti hoon:",
        "• **Messages** — jo tu mujhse baat karta hai (last ~200 per channel)",
        "• **Profile** — tera username, aur kitne baar roast/flirt hua",
        "• **Discord IDs** — server ID, channel ID, user ID (numbers only)",
        "",
        "Main kya **nahi** store karti:",
        "• Tera email, password, ya koi personal info",
        "• Messages jo mere baare mein nahi hai (sirf jo mujhse directly baat ho)",
        "• Koi bahar share nahi hota tera data",
        "",
        "**Apna data delete karna hai?**",
        "Type kar: `/deletedata` ya `!deletedata`",
        "",
        "More info: https://github.com/kunal099/advika-bot/blob/main/PRIVACY_POLICY.md",
      ].join("\n"),
      ephemeral: true,
    });
    return;
  }
});

client.on("error", (error) => {
  console.error("[Discord Error]:", error.message);
});

process.on("unhandledRejection", (error) => {
  console.error("[Unhandled Rejection]:", error);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ DISCORD_TOKEN not found in .env");
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY not found in .env");
  process.exit(1);
}

startKeepAlive();
client.login(token);

console.log("🚀 Advika booting up...");
