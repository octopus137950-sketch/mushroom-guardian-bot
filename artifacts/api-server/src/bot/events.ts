import {
  Client,
  Events,
  GuildMember,
  EmbedBuilder,
  Colors,
  TextChannel,
  ChatInputCommandInteraction,
} from "discord.js";
import { commands } from "./commands";
import { logger } from "../lib/logger";

const MUSHROOM_WELCOME = [
  "ยินดีต้อนรับสู่ Mycelium Network! 🍄 ขอให้สนุกกับการสำรวจป่าแห่งนี้!",
  "สปอร์ใหม่ได้เดินทางมาถึงแล้ว! 🌿 ยินดีต้อนรับสู่ชุมชนของเรา!",
  "เส้นใยเห็ดกำลังส่งสัญญาณต้อนรับคุณ! 🍄✨ ขอให้มีความสุขในเซิร์ฟเวอร์!",
  "Guardian ได้ตรวจพบสมาชิกใหม่! 🛡️🍄 ยินดีต้อนรับเข้าสู่ครอบครัว!",
  "รากเห็ดได้ยึดมั่นแล้ว — ยินดีต้อนรับสมาชิกใหม่! 🍄 ขอให้อยู่ดีมีสุข!",
];

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
    const guild = member.guild;

    const systemChannel = guild.systemChannel;
    const welcomeChannel =
      systemChannel ??
      (guild.channels.cache.find(
        (ch) => ch.isTextBased() && ch.name.toLowerCase().includes("welcome")
      ) as TextChannel | undefined) ??
      (guild.channels.cache.find((ch) => ch.isTextBased()) as TextChannel | undefined);

    if (!welcomeChannel || !("send" in welcomeChannel)) return;

    const msg = MUSHROOM_WELCOME[Math.floor(Math.random() * MUSHROOM_WELCOME.length)];

    const embed = new EmbedBuilder()
      .setColor(0x8b5e3c)
      .setTitle("🍄 สมาชิกใหม่มาถึงแล้ว!")
      .setDescription(`${member} ${msg}`)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: "📛 ชื่อ", value: member.user.tag, inline: true },
        { name: "👥 สมาชิกคนที่", value: `${guild.memberCount}`, inline: true },
        {
          name: "📅 เข้าร่วม Discord",
          value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
          inline: true,
        }
      )
      .setFooter({ text: "Mushroom-Guardian-Bot 🍄 | Guardian of the Mycelium Network" })
      .setTimestamp();

    await (welcomeChannel as TextChannel).send({ embeds: [embed] });
    logger.info({ userId: member.id, guild: guild.name }, "Welcome message sent");
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
}
