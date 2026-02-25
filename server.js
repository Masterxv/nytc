import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(compression()); // Compress responses for low-bandwidth/low-power devices
  app.use(express.json());

  // Alerting Endpoint
  app.post("/api/alert", async (req, res) => {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const results = {
      whatsapp: "pending",
      telegram: "pending"
    };

    // WhatsApp Alert
    try {
      const waBaseUrl = process.env.WA_API_URL || "https://shxsyj-5001.csb.app/message/send-text";
      const waSession = process.env.WA_SESSION_ID || "eth1";
      const waTarget = process.env.WA_TARGET_NUMBER || "120363403445687742@g.us";

      // Try adding session as a query param as well, as some APIs require it there
      const waUrl = `${waBaseUrl}?session=${waSession}`;

      // WhatsApp uses *bold* instead of <b>bold</b>
      const waMessage = message
        .replace(/<b>/g, "*")
        .replace(/<\/b>/g, "*");

      const waResponse = await fetch(waUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: waSession,
          sessionId: waSession, // Include both variations for compatibility
          to: waTarget,
          text: waMessage
        })
      });
      
      const waData = await waResponse.json().catch(() => ({}));
      results.whatsapp = waResponse.ok ? "success" : `failed (${waResponse.status}): ${waData.message || 'Unknown error'}`;
      
      if (!waResponse.ok) {
        console.error("WhatsApp API Error:", waData);
      }
    } catch (err) {
      console.error("WhatsApp alert error:", err.message);
      results.whatsapp = `error: ${err.message}`;
    }

    // Telegram Alert
    try {
      const tgToken = process.env.TELEGRAM_TOKEN || "5805768584:AAHhcNSEvNJtTNsoaC6fbijGcB1hACBrDG0";
      const tgChatId = process.env.TELEGRAM_CHAT_ID || "-1001530260851";
      const tgUrl = `https://api.telegram.org/bot${tgToken}/sendMessage`;

      const tgResponse = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: message,
          parse_mode: "HTML"
        })
      });
      results.telegram = tgResponse.ok ? "success" : `failed (${tgResponse.status})`;
    } catch (err) {
      console.error("Telegram alert error:", err.message);
      results.telegram = "error";
    }

    res.json(results);
  });

  // API Proxy for Binance to avoid CORS issues
  app.get("/api/klines", async (req, res) => {
    const { symbol, interval, limit } = req.query;
    
    if (!symbol || !interval) {
      return res.status(400).json({ error: "Missing symbol or interval" });
    }

    try {
      const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit || 100}`;
      const response = await fetch(binanceUrl);
      
      if (!response.ok) {
        throw new Error(`Binance API responded with ${response.status}`);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy error:", error.message);
      res.status(500).json({ error: "Failed to fetch data from Binance" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
