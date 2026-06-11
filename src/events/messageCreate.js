// src/events/messageCreate.js
const playCommand = require('../commands/play');
const controls = require('../commands/controls');

// Build a flat map: commandName/alias → handler
const commandMap = new Map();

// Register play
commandMap.set(playCommand.name, playCommand);
playCommand.aliases?.forEach(a => commandMap.set(a, playCommand));

// Register controls
Object.values(controls).forEach(cmd => {
  commandMap.set(cmd.name, cmd);
  cmd.aliases?.forEach(a => commandMap.set(a, cmd));
});

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return;

    const PREFIX = process.env.PREFIX || '!';
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = commandMap.get(commandName);
    if (!command) return;

    try {
      await command.execute(message, args);
    } catch (err) {
      console.error(`[Command Error] ${commandName}:`, err);
      message.reply('❌ An error occurred while executing that command.').catch(() => {});
    }
  },
};
