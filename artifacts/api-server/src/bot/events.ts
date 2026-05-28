import {
  Client,
  Events,
  GuildMember,
  ChatInputCommandInteraction,
} from "discord.js";
import { commands } from "./commands";
import { handleReactionAdd, handleReactionRemove } from "./reaction-roles";
import { handleMemberWelcome, handleMemberGoodbye } from "./welcome-goodbye";
import { logger } from "../lib/logger";

export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Mushroom-Guardian-Bot is online!");

    const { REST, Routes } = await import("discord.js");
    const rest = new REST().setToken(process.env["DISCORD_TOKEN"]!);

    const commandData = commands.map((cmd) => cmd.data.toJSON());

    try {
      await rest.put(Routes.applicationCommands(readyClient.user.id), {
        body: commandData,
      });
      logger.info({ count: commandData.length }, "Slash commands registered globally");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  });

  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    await handleMemberWelcome(member).catch((err) => {
      logger.error({ err, userId: member.id }, "Welcome handler error");
    });
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.partial) {
      try {
        await member.fetch();
      } catch {
        return;
      }
    }
    await handleMemberGoodbye(member as GuildMember).catch((err) => {
      logger.error({ err, userId: member.id }, "Goodbye handler error");
    });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = commands.find((c) => c.data.name === interaction.commandName);
    if (!cmd) return;

    try {
      await cmd.execute(interaction as ChatInputCommandInteraction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Command execution failed");
      const reply = { content: "❌ เกิดข้อผิดพลาดขณะรันคำสั่ง กรุณาลองใหม่อีกครั้ง", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  });

  client.on(Events.MessageReactionAdd, handleReactionAdd);
  client.on(Events.MessageReactionRemove, handleReactionRemove);
}
