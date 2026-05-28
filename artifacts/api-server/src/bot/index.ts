import { Client, GatewayIntentBits, Partials } from "discord.js";
import { registerEvents } from "./events";
import { logger } from "../lib/logger";

export function startBot(): void {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — Discord bot will not start");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
      Partials.GuildMember,
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
    ],
  });

  registerEvents(client);

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
  });
}
