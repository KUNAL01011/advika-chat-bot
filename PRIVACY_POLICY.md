# Privacy Policy — Advika Discord Bot

**Last Updated:** June 2026  
**Bot Name:** Advika  
**Developer:** Kunal Kumar  
**Contact:** kunal34255@gmail.com | https://discord.gg/pwMkSgEuvM

---

## 1. What is Advika?

Advika is an AI-powered Discord chatbot with a Gen Z Hinglish personality, built on Google Gemini. She responds when mentioned, when someone replies to her, or occasionally jumps in on her own.

---

## 2. What Data We Collect

When you interact with Advika in a Discord server, we collect and store:

| Data | What exactly | Why |
|------|-------------|-----|
| **Message content** | Text of messages you send to Advika (or that she sees) | To build conversation context for AI replies |
| **Discord User ID** | Your numeric Discord user ID | To link your history and profile |
| **Display name / Username** | Your server display name at time of message | To address you naturally in replies |
| **Server (Guild) ID** | The Discord server's numeric ID | To keep data scoped per-server |
| **Channel ID** | The channel's numeric ID | To keep conversation context per-channel |
| **Interaction counts** | How many times your messages were classified as "roast-tone" or "flirt-tone" replies | To keep Advika's personality consistent with you over time |

**We do NOT collect:**
- Your email address
- Your IP address
- Your password or account credentials
- Payment information
- Messages you send to other bots or people that don't involve Advika
- Voice data of any kind
- Direct Messages (Advika only works in servers)

---

## 3. How We Use Your Data

Your data is used **only** to:
- Generate context-aware, personality-consistent AI replies
- Remember recent conversation history (last ~200 messages per user per channel)
- Track tone consistency (roast vs. flirt count) for a more natural experience

**We do not:**
- Sell your data to anyone
- Share your data with any third party (except Google Gemini API — see Section 4)
- Use your data for advertising
- Train any AI model on your data
- Transfer data outside the bot's database

---

## 4. Third-Party Services

### Google Gemini API
Advika sends your message content and recent conversation history to **Google Gemini** (via the Gemini API) to generate responses. This data is processed under [Google's Privacy Policy](https://policies.google.com/privacy) and [Gemini API Terms](https://ai.google.dev/terms). We do not enable data training options in our API configuration.

### Discord
Advika operates within Discord's platform and is subject to [Discord's Privacy Policy](https://discord.com/privacy) and [Terms of Service](https://discord.com/terms).

### Render (Hosting)
The bot is hosted on [Render](https://render.com/privacy). Render may collect infrastructure-level logs (IP, request metadata) as part of standard hosting operations.

---

## 5. Data Retention

- **Message history:** We keep the last **200 messages per user per channel**. Older messages are automatically deleted.
- **User profiles:** Retained as long as you have interacted with Advika.
- **Quota tracking:** Daily API usage counts (dates only, no user data) are stored for rate limiting.
- **Render redeployments:** The SQLite database **resets on every Render redeploy** unless a persistent disk is configured. This means your data may be wiped during routine deployments.

---

## 6. Your Rights — Data Deletion

You can **delete all your data at any time**, instantly, using:

```
/deletedata
```
or
```
!deletedata
```

This will permanently delete:
- All your stored messages (across all channels and servers)
- Your user profile (username, roast/flirt counts)

Deletion is immediate and irreversible. Advika will treat you as a completely new user after this.

For questions or manual deletion requests, contact the developer via the support link above.

---

## 7. Children's Privacy

Advika is not directed at children under 13 years of age. Discord itself requires users to be at least 13. We do not knowingly collect data from children under 13. If you believe a child's data was collected, contact us for immediate deletion.

---

## 8. Changes to This Policy

We may update this Privacy Policy from time to time. The "Last Updated" date at the top will reflect changes. Continued use of Advika after updates constitutes acceptance of the revised policy.

---

## 9. Contact

For privacy questions, data requests, or concerns:

- **Developer:** Kunal Kumar
- **Email:** kunal34255@gmail.com
- **GitHub:** https://github.com/KUNAL01011/advika-chat-bot

---

*Advika is a personal/hobby project and is not affiliated with Discord Inc. or Google LLC.*
