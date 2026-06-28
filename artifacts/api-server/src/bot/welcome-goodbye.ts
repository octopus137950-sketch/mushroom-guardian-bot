import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  GuildMember,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { guildConfigsTable, type GuildConfig } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getGuildConfig(guildId: string): Promise<GuildConfig | null> {
  const rows = await db
    .select()
    .from(guildConfigsTable)
    .where(eq(guildConfigsTable.guildId, guildId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertGuildConfig(guildId: string, patch: Partial<Omit<GuildConfig, "guildId">>): Promise<void> {
  await db
    .insert(guildConfigsTable)
    .values({ guildId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: guildConfigsTable.guildId,
      set: { ...patch, updatedAt: new Date() },
    });
}

// ─── Placeholder replacement ──────────────────────────────────────────────────

function replacePlaceholders(template: string, member: GuildMember): string {
  return template
    .replace(/\{user\}/g, `${member}`)
    .replace(/\{username\}/g, member.displayName)
    .replace(/\{tag\}/g, member.user.tag)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{count\}/g, String(member.guild.memberCount));
}

// ─── Core send function ───────────────────────────────────────────────────────

async function sendWelcomeGoodbye(
  member: GuildMember,
  channelId: string,
  message: string,
  imageUrl: string | null | undefined,
  type: "welcome" | "goodbye"
): Promise<void> {
  const channel = member.guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel || !("send" in channel)) {
    logger.warn({ channelId, guildId: member.guild.id }, `${type} channel not found`);
    return;
  }

  const isWelcome = type === "welcome";
  const description = replacePlaceholders(message, member);

  const embed = new EmbedBuilder()
    .setColor(isWelcome ? 0x2ecc71 : 0xe74c3c)
    .setTitle(isWelcome ? "🍄 ยินดีต้อนรับ!" : "👋 ลาก่อน!")
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: isWelcome ? "👤 สมาชิกใหม่" : "👤 สมาชิกที่ลาจาก", value: member.user.tag, inline: true },
      { name: isWelcome ? "👥 สมาชิกคนที่" : "👥 เหลือสมาชิก", value: `${member.guild.memberCount} คน`, inline: true },
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

  if (imageUrl) embed.setImage(imageUrl);

  await channel.send({ embeds: [embed] });
  logger.info({ userId: member.id, type, channelId }, `${type} message sent`);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

export async function handleMemberWelcome(member: GuildMember): Promise<void> {
  const cfg = await getGuildConfig(member.guild.id);
  if (cfg?.welcomeEnabled && cfg.welcomeChannelId && cfg.welcomeMessage) {
    await sendWelcomeGoodbye(member, cfg.welcomeChannelId, cfg.welcomeMessage, cfg.welcomeImageUrl, "welcome");
  }
}

export async function handleChatWelcome(member: GuildMember): Promise<void> {
  const cfg = await getGuildConfig(member.guild.id);
  if (!cfg?.chatWelcomeEnabled || !cfg.chatWelcomeChannelId || !cfg.chatWelcomeMessage) return;
  const channel = member.guild.channels.cache.get(cfg.chatWelcomeChannelId) as TextChannel | undefined;
  if (!channel || !("send" in channel)) return;
  const text = replacePlaceholders(cfg.chatWelcomeMessage, member);
  await channel.send(text).catch((err) => {
    logger.warn({ err, channelId: cfg.chatWelcomeChannelId }, "Chat welcome send failed");
  });
}

export async function handleMemberGoodbye(member: GuildMember): Promise<void> {
  const cfg = await getGuildConfig(member.guild.id);
  if (cfg?.goodbyeEnabled && cfg.goodbyeChannelId && cfg.goodbyeMessage) {
    await sendWelcomeGoodbye(member, cfg.goodbyeChannelId, cfg.goodbyeMessage, cfg.goodbyeImageUrl, "goodbye");
  }
}

// ─── Command handlers ─────────────────────────────────────────────────────────

export async function executeChatWelcome(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "setup") {
    const message = interaction.options.getString("message", true);
    await upsertGuildConfig(guildId, {
      chatWelcomeEnabled: 1,
      chatWelcomeChannelId: interaction.channelId,
      chatWelcomeMessage: message,
    });
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("✅ ตั้งค่าข้อความต้อนรับในแชทแล้ว!")
      .addFields(
        { name: "📍 ห้อง", value: `<#${interaction.channelId}>`, inline: true },
        { name: "📝 ข้อความตัวอย่าง", value: replacePlaceholders(message, interaction.member as GuildMember) }
      )
      .addFields({ name: "💡 Placeholder", value: "`{user}` `{username}` `{tag}` `{server}` `{count}`" })
      .setFooter({ text: "ใช้ /chat-welcome test เพื่อทดสอบ" });
    await interaction.reply({ embeds: [embed], flags: 64 });

  } else if (sub === "disable") {
    await upsertGuildConfig(guildId, { chatWelcomeEnabled: 0 });
    await interaction.reply({ content: "✅ ปิดระบบต้อนรับในแชทแล้ว", flags: 64 });

  } else if (sub === "remove") {
    await upsertGuildConfig(guildId, {
      chatWelcomeEnabled: 0,
      chatWelcomeChannelId: null,
      chatWelcomeMessage: null,
    });
    await interaction.reply({ content: "🗑️ ลบการตั้งค่าต้อนรับในแชทเรียบร้อยแล้ว", flags: 64 });

  } else if (sub === "test") {
    const cfg = await getGuildConfig(guildId);
    if (!cfg?.chatWelcomeEnabled || !cfg.chatWelcomeChannelId || !cfg.chatWelcomeMessage) {
      await interaction.reply({ content: "❌ ยังไม่ได้ตั้งค่า ใช้ `/chat-welcome setup` ก่อน", flags: 64 });
      return;
    }
    await handleChatWelcome(interaction.member as GuildMember);
    await interaction.reply({ content: `✅ ส่งข้อความทดสอบไปที่ <#${cfg.chatWelcomeChannelId}> แล้ว`, flags: 64 });

  } else if (sub === "info") {
    const cfg = await getGuildConfig(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("📋 การตั้งค่าต้อนรับในแชท")
      .addFields(
        { name: "สถานะ", value: cfg?.chatWelcomeEnabled ? "✅ เปิด" : "❌ ปิด", inline: true },
        { name: "ห้อง", value: cfg?.chatWelcomeChannelId ? `<#${cfg.chatWelcomeChannelId}>` : "—", inline: true },
        { name: "ข้อความ", value: cfg?.chatWelcomeMessage ?? "—" }
      );
    await interaction.reply({ embeds: [embed], flags: 64 });
  }
}

export async function executeWelcome(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "setup") {
    const message = interaction.options.getString("message", true);
    const imageUrl = interaction.options.getString("image") ?? null;

    await upsertGuildConfig(guildId, {
      welcomeChannelId: interaction.channelId,
      welcomeMessage: message,
      welcomeImageUrl: imageUrl,
      welcomeEnabled: 1,
    });

    const previewMember = interaction.member as GuildMember;
    const previewText = replacePlaceholders(message, previewMember);

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("✅ ตั้งค่าข้อความต้อนรับแล้ว!")
      .addFields(
        { name: "📍 ห้องแจ้งเตือน", value: `<#${interaction.channelId}>`, inline: true },
        { name: "🖼️ รูปภาพ", value: imageUrl ? "✅ มี" : "❌ ไม่มี", inline: true },
        { name: "📝 ข้อความ (ตัวอย่าง)", value: previewText.length > 200 ? previewText.slice(0, 197) + "..." : previewText }
      )
      .addFields({
        name: "💡 Placeholder ที่ใช้ได้",
        value: "`{user}` — แท็กสมาชิก\n`{username}` — ชื่อสมาชิก\n`{tag}` — tag#0000\n`{server}` — ชื่อเซิร์ฟเวอร์\n`{count}` — จำนวนสมาชิก",
      })
      .setFooter({ text: "ใช้ /welcome test เพื่อทดสอบข้อความ" });

    await interaction.reply({ embeds: [embed], flags: 64 });
    logger.info({ guildId, channelId: interaction.channelId }, "Welcome configured");

  } else if (sub === "disable") {
    await upsertGuildConfig(guildId, { welcomeEnabled: 0 });
    await interaction.reply({ content: "✅ ปิดระบบต้อนรับแล้ว", flags: 64 });

  } else if (sub === "remove") {
    await upsertGuildConfig(guildId, {
      welcomeEnabled: 0,
      welcomeChannelId: null,
      welcomeMessage: null,
      welcomeImageUrl: null,
    });
    await interaction.reply({ content: "🗑️ ลบการตั้งค่าระบบต้อนรับทั้งหมดแล้ว", flags: 64 });

  } else if (sub === "test") {
    const cfg = await getGuildConfig(guildId);
    if (!cfg?.welcomeEnabled || !cfg.welcomeChannelId || !cfg.welcomeMessage) {
      await interaction.reply({ content: "❌ ยังไม่ได้ตั้งค่าระบบต้อนรับ ใช้ `/welcome setup` ก่อนนะครับ", flags: 64 });
      return;
    }
    const member = interaction.member as GuildMember;
    await sendWelcomeGoodbye(member, cfg.welcomeChannelId, cfg.welcomeMessage, cfg.welcomeImageUrl, "welcome");
    await interaction.reply({ content: `✅ ส่งข้อความทดสอบไปที่ <#${cfg.welcomeChannelId}> แล้วครับ`, flags: 64 });

  } else if (sub === "info") {
    const cfg = await getGuildConfig(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("📋 การตั้งค่าระบบต้อนรับ")
      .addFields(
        { name: "สถานะ", value: cfg?.welcomeEnabled ? "✅ เปิดใช้งาน" : "❌ ปิดใช้งาน", inline: true },
        { name: "ห้องแจ้งเตือน", value: cfg?.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : "—", inline: true },
        { name: "รูปภาพ", value: cfg?.welcomeImageUrl ? "✅ มี" : "ไม่มี", inline: true },
        { name: "ข้อความ", value: cfg?.welcomeMessage ?? "—" }
      )
      .setFooter({ text: "Mushroom-Guardian-Bot 🍄" });
    await interaction.reply({ embeds: [embed], flags: 64 });
  }
}

export async function executeGoodbye(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "setup") {
    const message = interaction.options.getString("message", true);
    const imageUrl = interaction.options.getString("image") ?? null;

    await upsertGuildConfig(guildId, {
      goodbyeChannelId: interaction.channelId,
      goodbyeMessage: message,
      goodbyeImageUrl: imageUrl,
      goodbyeEnabled: 1,
    });

    const previewMember = interaction.member as GuildMember;
    const previewText = replacePlaceholders(message, previewMember);

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("✅ ตั้งค่าข้อความลาก่อนแล้ว!")
      .addFields(
        { name: "📍 ห้องแจ้งเตือน", value: `<#${interaction.channelId}>`, inline: true },
        { name: "🖼️ รูปภาพ", value: imageUrl ? "✅ มี" : "❌ ไม่มี", inline: true },
        { name: "📝 ข้อความ (ตัวอย่าง)", value: previewText.length > 200 ? previewText.slice(0, 197) + "..." : previewText }
      )
      .addFields({
        name: "💡 Placeholder ที่ใช้ได้",
        value: "`{user}` — แท็กสมาชิก\n`{username}` — ชื่อสมาชิก\n`{tag}` — tag#0000\n`{server}` — ชื่อเซิร์ฟเวอร์\n`{count}` — จำนวนสมาชิก",
      })
      .setFooter({ text: "ใช้ /goodbye test เพื่อทดสอบข้อความ" });

    await interaction.reply({ embeds: [embed], flags: 64 });
    logger.info({ guildId, channelId: interaction.channelId }, "Goodbye configured");

  } else if (sub === "disable") {
    await upsertGuildConfig(guildId, { goodbyeEnabled: 0 });
    await interaction.reply({ content: "✅ ปิดระบบลาก่อนแล้ว", flags: 64 });

  } else if (sub === "remove") {
    await upsertGuildConfig(guildId, {
      goodbyeEnabled: 0,
      goodbyeChannelId: null,
      goodbyeMessage: null,
      goodbyeImageUrl: null,
    });
    await interaction.reply({ content: "🗑️ ลบการตั้งค่าระบบลาก่อนทั้งหมดแล้ว", flags: 64 });

  } else if (sub === "test") {
    const cfg = await getGuildConfig(guildId);
    if (!cfg?.goodbyeEnabled || !cfg.goodbyeChannelId || !cfg.goodbyeMessage) {
      await interaction.reply({ content: "❌ ยังไม่ได้ตั้งค่าระบบลาก่อน ใช้ `/goodbye setup` ก่อนนะครับ", flags: 64 });
      return;
    }
    const member = interaction.member as GuildMember;
    await sendWelcomeGoodbye(member, cfg.goodbyeChannelId, cfg.goodbyeMessage, cfg.goodbyeImageUrl, "goodbye");
    await interaction.reply({ content: `✅ ส่งข้อความทดสอบไปที่ <#${cfg.goodbyeChannelId}> แล้วครับ`, flags: 64 });

  } else if (sub === "info") {
    const cfg = await getGuildConfig(guildId);
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("📋 การตั้งค่าระบบลาก่อน")
      .addFields(
        { name: "สถานะ", value: cfg?.goodbyeEnabled ? "✅ เปิดใช้งาน" : "❌ ปิดใช้งาน", inline: true },
        { name: "ห้องแจ้งเตือน", value: cfg?.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : "—", inline: true },
        { name: "รูปภาพ", value: cfg?.goodbyeImageUrl ? "✅ มี" : "ไม่มี", inline: true },
        { name: "ข้อความ", value: cfg?.goodbyeMessage ?? "—" }
      )
      .setFooter({ text: "Mushroom-Guardian-Bot 🍄" });
    await interaction.reply({ embeds: [embed], flags: 64 });
  }
}
