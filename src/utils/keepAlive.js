// src/utils/keepAlive.js
const express = require("express");
const cron = require("node-cron");

function startKeepAlive() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.get("/", (req, res) =>
    res.json({
      status: "alive",
      bot: "Aurix Music Bot",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }),
  );

  app.get("/ping", (req, res) => res.send("pong"));

  app.listen(PORT, () => console.log(`🌐 Keep-alive server on port ${PORT}`));

  cron.schedule("*/14 * * * *", () => {
    const url = process.env.RENDER_URL;
    if (!url) return;
    const https = require("https");
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: "/ping",
        method: "GET",
      },
      (res) => {
        console.log(
          `[KeepAlive] Ping -> ${res.statusCode} at ${new Date().toISOString()}`,
        );
      },
    );
    req.on("error", (err) =>
      console.error("[KeepAlive] Ping failed:", err.message),
    );
    req.end();
  });

  console.log("Keep-alive cron scheduled (every 14 min)");
}

module.exports = { startKeepAlive };
