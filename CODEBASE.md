# Codebase: TexturasBolt

## 🛠️ Project Definition
- **OS:** Windows
- **Language:** JavaScript (Node.js)
- **Framework:** discord.js
- **Database:** MongoDB (Mongoose)

## 📁 File Dependencies
- `src/index.js` → `src/discord/client.js`, `src/database/connect.js`, `src/discord/handlers/painelHandler.js`, `src/discord/handlers/interactionHandler.js`
- `src/discord/handlers/painelHandler.js` → `src/discord/components/mainPanel.js`, `src/database/models/Version.js`
- `src/discord/handlers/interactionHandler.js` → `src/discord/components/mainPanel.js`, `src/discord/components/texturePanel.js`, `src/database/models/Version.js`, `src/database/models/Texture.js`

## 🔑 Environment Variables
- `DISCORD_TOKEN`: Bot authentication
- `MONGODB_URI`: Atlas connection string
- `REFERRER_URL`: App verification URL
- `BOT_COLOR`: Main theme color (#c773ff)

## 🎨 UI Standards (Components v2)
- Color: `#c773ff` (Primary)
- Style: Embeds with markdown titles (`##`), descriptions (`-#`), and separators (`━━━━━━━━━━`).
- Components: Buttons and Select Menus for navigation.
