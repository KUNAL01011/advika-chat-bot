// src/events/ready.js
module.exports = {
  name: "ready",
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);

    const statuses = [
      { type: 2, text: "!play <song>" },
      { type: 3, text: `${client.guilds.cache.size} servers` },
      { type: 0, text: "music in multiple VCs!" },
    ];

    let i = 0;
    const setStatus = () => {
      const s = statuses[i % statuses.length];
      client.user.setPresence({
        activities: [{ name: s.text, type: s.type }],
        status: "online",
      });
      i++;
    };
    setStatus();
    setInterval(setStatus, 30_000);
  },
};
