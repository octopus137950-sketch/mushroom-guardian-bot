import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger";

// ─── In-memory store: guildId:channelId → delay in seconds ──────────────────

const autoDeleteMap = new Map<string, number>();

function channelKey(guildId: string, channelId: string): string {
  return `${guildId}:${channelId}`;
}

export function getAutoDeleteDelay(guildId: string, channelId: string): number | undefined {
  return autoDeleteMap.get(channelKey(guildId, channelId));
}

// ─── MessageCreate handler ───────────────────────────────────────────────────

export async function handleAutoDelete(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const delay = getAutoDeleteDelay(message.guild.id, message.channel.id);
  if (!delay) return;

  setTimeout(() => {
    message.delete().catch((err) => {
      if (err.code !== 10008) {
        logger.warn({ err, messageId: message.id }, "Auto-delete failed");
      }
    });
  }, delay * 1000);
}

// ─── Command handler ─────────────────────────────────────────────────────────

export async function executeAutodelete(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: "❌ ใช้คำสั่งนี้ได้ในเซิร์ฟเวอร์เท่านั้น", flags: 64 });
    return;
  }

  const channel = interaction.options.getChannel("channel") ?? interaction.channel;
  if (!channel) {
    await interaction.reply({ content: "❌ ไม่พบช่องแชทที่ระบุ", flags: 64 });
    return;
  }

  const channelId = channel.id;

  if (sub === "set") {
    const seconds = interaction.options.getInteger("seconds", true);

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: "❌ ต้องการสิทธิ์ **จัดการข้อความ** เพื่อใช้คำสั่งนี้", flags: 64 });
      return;
    }

    autoDeleteMap.set(channelKey(guildId, channelId), seconds);

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("🗑️ ตั้งค่าลบข้อความอัตโนมัติแล้ว")
      .addFields(
        { name: "ช่องแชท", value: `<#${channelId}>`, inline: true },
        { name: "ลบหลังจาก", value: `${seconds} วินาที`, inline: true }
      )
      .setDescription("ข้อความทุกข้อความในช่องนี้จะถูกลบอัตโนมัติตามเวลาที่กำหนด")
      .setFooter({ text: "หมายเหตุ: การตั้งค่านี้จะรีเซ็ตเมื่อบอทรีสตาร์ท" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    logger.info({ guildId, channelId, seconds }, "Auto-delete configured");

  } else if (sub === "off") {

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: "❌ ต้องการสิทธิ์ **จัดการข้อความ** เพื่อใช้คำสั่งนี้", flags: 64 });
      return;
    }

    const existed = autoDeleteMap.delete(channelKey(guildId, channelId));

    if (!existed) {
      await interaction.reply({ content: `ℹ️ ช่อง <#${channelId}> ไม่ได้เปิดใช้การลบอัตโนมัติอยู่`, flags: 64 });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("🗑️ ปิดการลบข้อความอัตโนมัติแล้ว")
      .addFields({ name: "ช่องแชท", value: `<#${channelId}>`, inline: true })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    logger.info({ guildId, channelId }, "Auto-delete disabled");

  } else if (sub === "list") {

    const guildEntries = Array.from(autoDeleteMap.entries())
      .filter(([key]) => key.startsWith(`${guildId}:`))
      .map(([key, secs]) => {
        const chId = key.split(":")[1];
        return `<#${chId}> — **${secs} วินาที**`;
      });

    if (guildEntries.length === 0) {
      await interaction.reply({ content: "ℹ️ ยังไม่มีช่องแชทที่เปิดใช้การลบอัตโนมัติ", flags: 64 });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("🗑️ รายการลบข้อความอัตโนมัติ")
      .setDescription(guildEntries.join("\n"))
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  }
}
