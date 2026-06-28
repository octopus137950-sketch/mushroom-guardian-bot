import {
  Client,
  Events,
  GuildMember,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  Message,
} from "discord.js";
import { commands } from "./commands";
import { handleReactionAdd, handleReactionRemove } from "./reaction-roles";
import { handleMemberWelcome, handleMemberGoodbye } from "./welcome-goodbye";
import { getShopItems, handleMonsterButton } from "./minigame";
import { handleCasinoButton, handleCasinoModal } from "./casino";
import { handleChatWelcome } from "./welcome-goodbye";
import { handleAutoDelete } from "./autodelete";
import { handleTradingButton, handleTradingSelect } from "./trading";
import { logger } from "../lib/logger";

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const { commandName } = interaction;
  const focused = interaction.options.getFocused(true);

  if (focused.name !== "item_id") return;

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  try {
    const items = await getShopItems(guildId);
    const query = focused.value.toLowerCase();

    const matches = items
      .filter((item) => item.name.toLowerCase().includes(query) || item.id.includes(query))
      .slice(0, 25)
      .map((item) => ({
        name: `${item.emoji} ${item.name} — ${item.price.toLocaleString()} สปอร์`,
        value: item.id,
      }));

    await interaction.respond(matches);
  } catch (err) {
    logger.error({ err, commandName }, "Autocomplete error");
    await interaction.respond([]);
  }
}

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
    await handleChatWelcome(member).catch((err) => {
      logger.error({ err, userId: member.id }, "Chat welcome handler error");
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
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction).catch((err) => {
        logger.error({ err }, "Unhandled autocomplete error");
      });
      return;
    }

    if (interaction.isButton() && (interaction.customId.startsWith("monster_fight_") || interaction.customId.startsWith("monster_run_"))) {
      await handleMonsterButton(interaction).catch((err) => {
        logger.error({ err }, "Monster button error");
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === "casino_bet") {
      await handleCasinoButton(interaction).catch((err) => {
        logger.error({ err }, "Casino button error");
      });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === "casino_modal") {
      await handleCasinoModal(interaction).catch((err) => {
        logger.error({ err }, "Casino modal error");
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === "trading_trade") {
      await handleTradingButton(interaction).catch((err) => {
        logger.error({ err }, "Trading button error");
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "trading_select") {
      await handleTradingSelect(interaction).catch((err) => {
        logger.error({ err }, "Trading select error");
      });
      return;
    }

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

  client.on(Events.MessageCreate, async (message: Message) => {
    await handleAutoDelete(message).catch((err) => {
      logger.error({ err }, "Auto-delete handler error");
    });
  });

  client.on(Events.MessageReactionAdd, handleReactionAdd);
  client.on(Events.MessageReactionRemove, handleReactionRemove);
}
