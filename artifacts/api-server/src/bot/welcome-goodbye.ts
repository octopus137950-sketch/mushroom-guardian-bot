import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  GuildMember,
  TextChannel,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger";

interface ChannelConfig {
  channelId: string;
  message: string;
  imageUrl?: string;
  enabled: boolean;
}

interface GuildWGConfig {
  welcome?: ChannelConfig;
  goodbye?: ChannelConfig;
}

const configs = new Map<string, GuildWGConfig>();

function getConfig(guildId: string): GuildWGConfig {
  if (!configs.has(guildId)) configs.set(guildId, {});
  return configs.get(guildId)!;
}

function replacePlaceholders(template: string, member: GuildMember): string {
  return template
    .replace(/\{user\}/g, `${member}`)
    .replace(/\{username\}/g, member.displayName)
    .replace(/\{tag\}/g, member.user.tag)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{count\}/g, String(member.guild.memberCount));
}

async function sendWelcomeGoodbye(
  member: GuildMember,
  cfg: ChannelConfig,
  type: "welcome" | "goodbye"
): Promise<void> {
  const channel = member.guild.channels.cache.get(cfg.channelId) as TextChannel | undefined;
  if (!channel || !("send" in channel)) {
    logger.warn({ channelId: cfg.channelId, guildId: member.guild.id }, `${type} channel not found`);
    return;
  }

  const isWelcome = type === "welcome";
  const description = replacePlaceholders(cfg.message, member);

  const embed = new EmbedBuilder()
    .setColor(isWelcome ? 0x2ecc71 : 0xe74c3c)
    .setTitle(isWelcome ? "🍄 ยินดีต้อนรับ!" : "👋 ลาก่อน!")
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: isWelcome ? "👤 สมาชิกใหม่" : "👤 สมาชิกที่ลาจาก", value: member.user.tag, inline: true },
      {
        name: isWelcome ? "👥 สมาชิกคนที่" : "👥 เหลือสมาชิก",
        value: `${member.guild.memberCount} คน`,
        inline: true,
      },
      {
        name: isWelcome ? "📅 เข้าร่วม Discord" : "📅 เข้าร่วมเซิร์ฟเวอร์",
        value: isWelcome
          ? `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`
          : `<t:${Math.floor((member.joinedTimestamp ?? Date.now()) / 1000)}:R>`,
        inline: true,
      }
    )
    .setFooter({ text: `${member.guild.name} | Mushroom-Guardian-Bot 🍄` })
    .setTimestamp();

  if (cfg.imageUrl) {
    embed.setImage(cfg.imageUrl);
  }

  await channel.send({ embeds: [embed] });
  logger.info({ userId: member.id, type, channelId: cfg.channelId }, `${type} message sent`);
}

export async function handleMemberWelcome(member: GuildMember): Promise<void> {
  const cfg = getConfig(member.guild.id);
  if (cfg.welcome?.enabled) {
    await sendWelcomeGoodbye(member, cfg.welcome, "welcome");
  }
}

export async function handleMemberGoodbye(member: GuildMember): Promise<void> {
  const cfg = getConfig(member.guild.id);
  if (cfg.goodbye?.enabled) {
    await sendWelcomeGoodbye(member, cfg.goodbye, "goodbye");
  }
}

export async function executeWelcome(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);

  if (sub === "setup") {
    const message = interaction.options.getString("message", true);
    const imageUrl = interaction.options.getString("image") ?? undefined;

    cfg.welcome = {
      channelId: interaction.channelId,
      message,
      imageUrl,
      enabled: true,
    };

    const previewMember = interaction.member as GuildMember;
    const previewText = replacePlaceholders(message, previewMember);

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("✅ ตั้งค่าข้อความต้อนรับแล้ว!")
      .addFields(
        { name: "📍 ห้องแจ้งเตือน", value: `<#${interaction.channelId}>`, inline: true },
        { name: "🖼️ รูปภาพ", value: imageUrl ? "✅ มี" : "❌ ไม่มี", inline: true },
        {
          name: "📝 ข้อความ (ตัวอย่าง)",
          value: previewText.length > 200 ? previewText.slice(0, 197) + "..." : previewText,
        }
      )
      .addFields({
        name: "💡 Placeholder ที่ใช้ได้",
        value:
          "`{user}` — แท็กสมาชิก\n`{username}` — ชื่อสมาชิก\n`{tag}` — tag#0000\n`{server}` — ชื่อเซิร์ฟเวอร์\n`{count}` — จำนวนสมาชิก",
      })
      .setFooter({ text: "ใช้ /welcome test เพื่อทดสอบข้อความ" });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    logger.info({ guildId, channelId: interaction.channelId }, "Welcome configured");
  } else if (sub === "disable") {
    if (cfg.welcome) cfg.welcome.enabled = false;
    await interaction.reply({ content: "✅ ปิดระบบต้อนรับแล้ว", ephemeral: true });
  } else if (sub === "test") {
    if (!cfg.welcome?.enabled) {
      await interaction.reply({ content: "❌ ยังไม่ได้ตั้งค่าระบบต้อนรับ ใช้ `/welcome setup` ก่อนนะครับ", ephemeral: true });
      return;
    }
    const member = interaction.member as GuildMember;
    await sendWelcomeGoodbye(member, cfg.welcome, "welcome");
    await interaction.reply({ content: `✅ ส่งข้อความทดสอบไปที่ <#${cfg.welcome.channelId}> แล้วครับ`, ephemeral: true });
  } else if (sub === "info") {
    const w = cfg.welcome;
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("📋 การตั้งค่าระบบต้อนรับ")
      .addFields(
        { name: "สถานะ", value: w?.enabled ? "✅ เปิดใช้งาน" : "❌ ปิดใช้งาน", inline: true },
        { name: "ห้องแจ้งเตือน", value: w ? `<#${w.channelId}>` : "—", inline: true },
        { name: "รูปภาพ", value: w?.imageUrl ? "✅ มี" : "ไม่มี", inline: true },
        { name: "ข้อความ", value: w?.message ?? "—" }
      )
      .setFooter({ text: "Mushroom-Guardian-Bot 🍄" });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

export async function executeGoodbye(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);

  if (sub === "setup") {
    const message = interaction.options.getString("message", true);
    const imageUrl = interaction.options.getString("image") ?? undefined;

    cfg.goodbye = {
      channelId: interaction.channelId,
      message,
      imageUrl,
      enabled: true,
    };

    const previewMember = interaction.member as GuildMember;
    const previewText = replacePlaceholders(message, previewMember);

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("✅ ตั้งค่าข้อความลาก่อนแล้ว!")
      .addFields(
        { name: "📍 ห้องแจ้งเตือน", value: `<#${interaction.channelId}>`, inline: true },
        { name: "🖼️ รูปภาพ", value: imageUrl ? "✅ มี" : "❌ ไม่มี", inline: true },
        {
          name: "📝 ข้อความ (ตัวอย่าง)",
          value: previewText.length > 200 ? previewText.slice(0, 197) + "..." : previewText,
        }
      )
      .addFields({
        name: "💡 Placeholder ที่ใช้ได้",
        value:
          "`{user}` — แท็กสมาชิก\n`{username}` — ชื่อสมาชิก\n`{tag}` — tag#0000\n`{server}` — ชื่อเซิร์ฟเวอร์\n`{count}` — จำนวนสมาชิก",
      })
      .setFooter({ text: "ใช้ /goodbye test เพื่อทดสอบข้อความ" });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    logger.info({ guildId, channelId: interaction.channelId }, "Goodbye configured");
  } else if (sub === "disable") {
    if (cfg.goodbye) cfg.goodbye.enabled = false;
    await interaction.reply({ content: "✅ ปิดระบบลาก่อนแล้ว", ephemeral: true });
  } else if (sub === "test") {
    if (!cfg.goodbye?.enabled) {
      await interaction.reply({ content: "❌ ยังไม่ได้ตั้งค่าระบบลาก่อน ใช้ `/goodbye setup` ก่อนนะครับ", ephemeral: true });
      return;
    }
    const member = interaction.member as GuildMember;
    await sendWelcomeGoodbye(member, cfg.goodbye, "goodbye");
    await interaction.reply({ content: `✅ ส่งข้อความทดสอบไปที่ <#${cfg.goodbye.channelId}> แล้วครับ`, ephemeral: true });
  } else if (sub === "info") {
    const g = cfg.goodbye;
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("📋 การตั้งค่าระบบลาก่อน")
      .addFields(
        { name: "สถานะ", value: g?.enabled ? "✅ เปิดใช้งาน" : "❌ ปิดใช้งาน", inline: true },
        { name: "ห้องแจ้งเตือน", value: g ? `<#${g.channelId}>` : "—", inline: true },
        { name: "รูปภาพ", value: g?.imageUrl ? "✅ มี" : "ไม่มี", inline: true },
        { name: "ข้อความ", value: g?.message ?? "—" }
      )
      .setFooter({ text: "Mushroom-Guardian-Bot 🍄" });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
