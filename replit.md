# Mushroom-Guardian-Bot

บอท Discord ผู้พิทักษ์เห็ดสำหรับดูแลเซิร์ฟเวอร์ พร้อมคำสั่งมอเดอเรชั่นและความรู้เรื่องเห็ด

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Discord bot (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `DISCORD_TOKEN` — Discord Bot Token (from Discord Developer Portal)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Discord: discord.js v14
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — Discord bot code
  - `index.ts` — bot startup (startBot function)
  - `commands.ts` — all 9 slash commands
  - `events.ts` — event handlers (ready, guildMemberAdd, interactionCreate)
- `artifacts/api-server/src/index.ts` — starts Express + bot together

## Bot Commands

| คำสั่ง | คำอธิบาย |
|--------|----------|
| `/mushroom fact` | ความรู้เรื่องเห็ดแบบสุ่ม |
| `/mushroom type` | สุ่มชนิดเห็ดน่าสนใจ |
| `/warn <user> <reason>` | ตักเตือนสมาชิก |
| `/warnlist <user>` | ดูประวัติคำเตือน |
| `/kick <user>` | เตะสมาชิก |
| `/ban <user>` | แบนสมาชิก |
| `/timeout <user> <minutes>` | ปิดเสียงชั่วคราว |
| `/clear <amount>` | ลบข้อความ |
| `/serverinfo` | ดูข้อมูลเซิร์ฟเวอร์ |
| `/help` | ดูคำสั่งทั้งหมด |

## Architecture decisions

- Bot runs alongside Express in the same process — simpler deployment, single workflow
- Slash commands registered globally on startup via REST API using `client.user.id`
- Warn store is in-memory (Map) — suitable for single-instance; upgrade to DB if needed
- bufferutil and utf-8-validate externalized in esbuild (optional native deps of discord.js)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Discord slash commands registered globally can take up to 1 hour to propagate to all servers (guild-scoped commands are instant)
- Must enable "Server Members Intent" and "Message Content Intent" in Discord Developer Portal > Bot settings
- DISCORD_TOKEN must be set in secrets before starting the server

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
