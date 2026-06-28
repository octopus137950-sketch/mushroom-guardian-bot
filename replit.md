# Mushroom-Guardian-Bot

บอท Discord ผู้พิทักษ์เห็ดสำหรับดูแลเซิร์ฟเวอร์ พร้อมคำสั่งมอเดอเรชั่น มินิเกม คาสิโน และความรู้เรื่องเห็ด

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Discord bot (port 8080)
- `pnpm --filter @workspace/dashboard run dev` — run the web dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `DISCORD_TOKEN` — Discord Bot Token (from Discord Developer Portal)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Discord: discord.js v14
- Build: esbuild (CJS bundle)
- Dashboard: React + Vite + Tailwind CSS

## Where things live

- `artifacts/api-server/src/bot/` — Discord bot code
  - `index.ts` — bot startup (startBot function)
  - `commands.ts` — all 28 slash commands
  - `events.ts` — event handlers (ready, guildMemberAdd, interactionCreate, messageCreate)
  - `minigame.ts` — farm minigame + monster fight + channel restrictions
  - `casino.ts` — casino panel system
  - `reaction-roles.ts` — reaction role panels
  - `welcome-goodbye.ts` — welcome/goodbye/chat-welcome systems
  - `trading.ts` — crypto/forex price lookup (CoinGecko + OpenExchangeRates)
  - `autodelete.ts` — auto-delete messages in channels
  - `state.ts` — bot client state (shared with API routes)
- `artifacts/api-server/src/routes/` — Express API routes
  - `bot.ts` — /api/bot/status, /api/bot/stats, /api/bot/leaderboard
- `artifacts/dashboard/` — Web dashboard (React + Vite)
- `artifacts/api-server/src/index.ts` — starts Express + bot together
- `lib/db/src/schema/mushroom-game.ts` — DB schema (mushroom_players, guild_configs, mushroom_shop_items)

## Bot Commands (28 total)

### 🍄 เห็ด
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `/mushroom fact` | ความรู้เรื่องเห็ดแบบสุ่ม |
| `/mushroom type` | สุ่มชนิดเห็ดน่าสนใจ |

### 🛡️ มอเดอเรชั่น
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `/warn <user> <reason>` | ตักเตือนสมาชิก |
| `/warnlist <user>` | ดูประวัติคำเตือน |
| `/kick <user>` | เตะสมาชิก |
| `/ban <user>` | แบนสมาชิก |
| `/timeout <user> <minutes>` | ปิดเสียงชั่วคราว |
| `/clear <amount>` | ลบข้อความ |
| `/serverinfo` | ดูข้อมูลเซิร์ฟเวอร์ |
| `/help` | ดูคำสั่งทั้งหมด |

### 🌾 มินิเกมฟาร์ม
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `/farm` | ออกฟาร์มเก็บสปอร์ (cooldown 60s, มีมอนสเตอร์ต่อสู้!) |
| `/wallet [user]` | ดูกระเป๋าสปอร์ |
| `/daily` | เช็คอินรายวัน |
| `/leaderboard` | อันดับผู้เล่น Top 10 |
| `/shop` | ดูร้านค้า |
| `/buy <item>` | ซื้อสินค้า |
| `/give-spore <user> <amount>` | แจกสปอร์ (แอดมิน) |
| `/set-spore <user> <amount>` | ตั้งค่าสปอร์ (แอดมิน) |
| `/farm-config` | ตั้งค่าระบบมินิเกม (แอดมิน) |
| `/shop-item` | จัดการสินค้าในร้าน (แอดมิน) |
| `/channel-config` | ตั้งค่าช่องสำหรับระบบต่างๆ (แอดมิน) |

### 🎰 คาสิโน
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `/casino-setup` | ติดตั้งแผงคาสิโน (แอดมิน) |
| `/casino-remove` | ถอดแผงคาสิโน (แอดมิน) |

### 🎭 ระบบต้อนรับ & ยศ
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `/welcome` | ตั้งค่าต้อนรับสมาชิกใหม่ (setup/disable/remove/test/info) |
| `/goodbye` | ตั้งค่าลาก่อนสมาชิก (setup/disable/remove/test/info) |
| `/chat-welcome` | ต้อนรับแบบข้อความธรรมดา (setup/disable/remove/test/info) |
| `/reactionrole` | ระบบรับยศผ่านอิโมจิ (create/add/remove/delete/list) |

### 💹 Trading
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `/trade crypto <coin>` | ดูราคาคริปโต real-time (BTC, ETH, SOL, etc.) |
| `/trade forex <from> <to>` | ดูอัตราแลกเปลี่ยนสกุลเงิน |

### 🗑️ Auto-delete
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `/autodelete set <seconds> [channel]` | เปิดลบข้อความอัตโนมัติ |
| `/autodelete off [channel]` | ปิดลบอัตโนมัติ |
| `/autodelete list` | ดูรายการช่องที่เปิดลบอัตโนมัติ |

## Architecture decisions

- Bot runs alongside Express in the same process — simpler deployment, single workflow
- Slash commands registered globally on startup via REST API using `client.user.id`
- Warn store is in-memory (Map) — suitable for single-instance; upgrade to DB if needed
- Auto-delete store is in-memory — resets on bot restart (by design, simpler)
- bufferutil and utf-8-validate externalized in esbuild (optional native deps of discord.js)
- Trading uses free public APIs: CoinGecko (crypto) + Open Exchange Rates (forex), no API key needed
- Web dashboard at `/` reads bot state from shared in-memory state module

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Discord slash commands registered globally can take up to 1 hour to propagate to all servers (guild-scoped commands are instant)
- Must enable "Server Members Intent" and "Message Content Intent" in Discord Developer Portal > Bot settings
- DISCORD_TOKEN must be set in secrets before starting the server
- Auto-delete requires "Message Content Intent" to be enabled in Discord Developer Portal

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
