import { Client } from "discord.js";

let botClient: Client | null = null;
let botStartTime: number | null = null;

export function setBotClient(client: Client): void {
  botClient = client;
  botStartTime = Date.now();
}

export function getBotClient(): Client | null {
  return botClient;
}

export function getBotState() {
  if (!botClient || !botClient.user) {
    return {
      online: false,
      username: null,
      clientId: null,
      guildCount: 0,
      commandCount: 0,
      uptime: null,
      inviteUrl: null,
    };
  }

  const clientId = botClient.user.id;
  const permissions = "8";
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

  return {
    online: true,
    username: botClient.user.tag,
    clientId,
    guildCount: botClient.guilds.cache.size,
    commandCount: 27,
    uptime: botStartTime ? Math.floor((Date.now() - botStartTime) / 1000) : null,
    inviteUrl,
  };
}
