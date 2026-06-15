import express from "express";
import cron from "node-cron";
import https from "https";

export function startKeepAlive() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.get("/", (req, res) =>
    res.json({
      status: "alive",
      bot: "Advika Chatbot",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  );

  app.get("/ping", (req, res) => res.send("pong"));

  app.listen(PORT, "0.0.0.0", () =>
    console.log(`🌐 Keep-alive server running on port ${PORT}`)
  );

  // Ping self every 14 minutes to prevent Render sleep
  cron.schedule("*/14 * * * *", () => {
    const url = process.env.RENDER_URL;
    if (!url) return;
    try {
      const urlObj = new URL(url);
      const req = https.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: "/ping",
          method: "GET",
        },
        (res) => {
          console.log(`[KeepAlive] ${res.statusCode} at ${new Date().toISOString()}`);
        }
      );
      req.on("error", (err) =>
        console.error("[KeepAlive] Ping failed:", err.message)
      );
      req.end();
    } catch (err) {
      console.error("[KeepAlive] URL parse error:", err.message);
    }
  });

  console.log("✅ Keep-alive cron scheduled (every 14 min)");
}
