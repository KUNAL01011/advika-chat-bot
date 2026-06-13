import { executeCommand } from "../commands/music.js";

const PREFIX = "!";

export const handleMessage = async (message, player) => {
  // Ignore bots and missing prefixes
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  // Split content into args array and extract the base command
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  // Basic Utility Commands
  if (commandName === "ping") {
    return message.reply("Pong!");
  }

  // Route to Music Logic
  await executeCommand(commandName, message, args, player);
};
