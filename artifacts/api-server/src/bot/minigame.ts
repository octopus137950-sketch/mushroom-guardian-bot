import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  PermissionFlagsBits,
  GuildMember,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import {
  mushroomPlayersTable,
  mushroomShopItemsTable,
  type MushroomPlayer,
  type MushroomShopItem,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FarmEvent {
  weight: number;
  name: string;
  emoji: string;
  type: "add" | "subtract" | "percent";
  min?: number;
  max?: number;
  percent?: number;
  exp: number;
  msg: string;
  color: number;
}

interface GuildGameConfig {
  logChannelId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COOLDOWN_MS = 60_000;

const FARM_EVENTS: FarmEvent[] = [
  {
    weight: 45, name: "เห็ดฟาง", emoji: "🍄", type: "add", min: 10, max: 15, exp: 5,
    msg: "ท่านพบ **\"เห็ดฟางธรรมดา\"** ข้างขอนไม้ผุ บดทำยาได้เล็กน้อย!",
    color: 0x8b5e3c,
  },
  {
    weight: 30, name: "เห็ดเรืองแสง", emoji: "✨", type: "add", min: 25, max: 40, exp: 5,
    msg: "ยินดีด้วย! ท่านขุดพบ **\"เห็ดเรืองแสงเวทมนตร์\"** ในถ้ำลึก!",
    color: 0x9b59b6,
  },
  {
    weight: 5, name: "เห็ดทองคำ", emoji: "👑", type: "add", min: 100, max: 150, exp: 5,
    msg: "ปังมาก! ท่านบังเอิญเจอ **\"เห็ดทองคำโบราณ\"** ยอดเห็ดหายากแห่งราชวงศ์!",
    color: 0xf1c40f,
  },
  {
    weight: 15, name: "แมงมุมซุ่มโจมตี", emoji: "🕷️", type: "subtract", min: 15, max: 25, exp: 5,
    msg: "แย่แล้ว! ท่านโดนแมงมุมป่าเห็ดซุ่มโจมตีจนตกใจทำตะกร้าคว่ำ!",
    color: 0xe74c3c,
  },
  {
    weight: 5, name: "นกฮูกขโมยของ", emoji: "🦉", type: "percent", percent: 10, exp: 5,
    msg: "โชคร้ายจริง! นกฮูกลึกลับบินโฉบขโมยตะกร้าเห็ดของท่านไปต่อหน้าต่อตา!",
    color: 0x95a5a6,
  },
];

// ─── Guild config store (in-memory) ──────────────────────────────────────────

const guildConfigs = new Map<string, GuildGameConfig>();

export function getGuildConfig(guildId: string): GuildGameConfig {
  if (!guildConfigs.has(guildId)) {
    guildConfigs.set(guildId, {});
  }
  return guildConfigs.get(guildId)!;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollEvent(): FarmEvent {
  const total = FARM_EVENTS.reduce((s, e) => s + e.weight, 0);
  let rand = Math.random() * total;
  for (const event of FARM_EVENTS) {
    rand -= event.weight;
    if (rand <= 0) return event;
  }
  return FARM_EVENTS[0]!;
}

function expForNextLevel(level: number): number {
  return level * 100;
}

function expBar(current: number, max: number, width = 10): string {
  const filled = Math.min(Math.floor((current / max) * width), width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function rarityLabel(event: FarmEvent): string {
  if (event.weight <= 5) return "⭐⭐⭐ หายากมาก";
  if (event.weight <= 15) return "⭐⭐ หายาก";
  if (event.weight <= 30) return "⭐ ไม่ค่อยพบ";
  return "◻️ ทั่วไป";
}

function generateItemId(guildId: string, name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9ก-ฮ]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 20);
  const suffix = Date.now().toString(36).slice(-4);
  return `${base}_${suffix}`;
}

async function getOrCreatePlayer(userId: string): Promise<MushroomPlayer> {
  const existing = await db
    .select()
    .from(mushroomPlayersTable)
    .where(eq(mushroomPlayersTable.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0]!;

  const [created] = await db
    .insert(mushroomPlayersTable)
    .values({ userId })
    .returning();
  return created!;
}

export async function getShopItems(guildId: string): Promise<MushroomShopItem[]> {
  return db
    .select()
    .from(mushroomShopItemsTable)
    .where(eq(mushroomShopItemsTable.guildId, guildId));
}

async function getShopItem(guildId: string, itemId: string): Promise<MushroomShopItem | null> {
  const rows = await db
    .select()
    .from(mushroomShopItemsTable)
    .where(
      and(
        eq(mushroomShopItemsTable.id, itemId),
        eq(mushroomShopItemsTable.guildId, guildId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

async function sendLog(
  guildId: string,
  client: { guilds: { cache: Map<string, { channels: { cache: Map<string, unknown> } }> } } | null,
  embed: EmbedBuilder
): Promise<void> {
  const cfg = getGuildConfig(guildId);
  if (!cfg.logChannelId || !client) return;
  try {
    const guild = (client.guilds.cache as Map<string, { channels: { cache: Map<string, unknown> } }>).get(guildId);
    const channel = guild?.channels.cache.get(cfg.logChannelId) as TextChannel | undefined;
    if (channel && "send" in channel) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    logger.warn({ err, guildId }, "Could not send log message");
  }
}

// ─── Command Handlers ────────────────────────────────────────────────────────

export async function executeFarm(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const player = await getOrCreatePlayer(userId);

  const now = Date.now();
  const lastFarm = player.lastFarmTime ? new Date(player.lastFarmTime).getTime() : 0;
  const elapsed = now - lastFarm;

  if (elapsed < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("⏳ ยังฟาร์มไม่ได้!")
      .setDescription(`ท่านเพิ่งฟาร์มไปหยกๆ ต้องรออีก **${remaining} วินาที** ก่อนนะครับ!\nพักดื่มน้ำชาก่อนแล้วค่อยกลับมาฟาร์มใหม่ 🍵`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: "Mushroom Kingdom 🍄" });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const event = rollEvent();
  const levelBonus = (player.farmLevel - 1) * 2;
  let pointChange = 0;
  let pointDesc = "";

  if (event.type === "add") {
    const base = randInt(event.min!, event.max!);
    pointChange = base + levelBonus;
    pointDesc = `+${pointChange} สปอร์ (โบนัสเลเวล: +${levelBonus})`;
  } else if (event.type === "subtract") {
    const base = randInt(event.min!, event.max!);
    pointChange = -base;
    pointDesc = `${pointChange} สปอร์`;
  } else if (event.type === "percent") {
    const stolen = Math.ceil(player.sporePoints * (event.percent! / 100));
    pointChange = -stolen;
    pointDesc = `-${stolen} สปอร์ (${event.percent}% ของที่มี)`;
  }

  const newPoints = Math.max(0, player.sporePoints + pointChange);
  const newExp = player.farmExp + event.exp;
  let newLevel = player.farmLevel;
  let leveledUp = false;

  let expLeft = newExp;
  while (expLeft >= expForNextLevel(newLevel)) {
    expLeft -= expForNextLevel(newLevel);
    newLevel++;
    leveledUp = true;
  }

  await db
    .update(mushroomPlayersTable)
    .set({
      sporePoints: newPoints,
      farmExp: expLeft,
      farmLevel: newLevel,
      lastFarmTime: new Date(),
    })
    .where(eq(mushroomPlayersTable.userId, userId));

  const nextLevelExp = expForNextLevel(newLevel);
  const bar = expBar(expLeft, nextLevelExp);

  const embed = new EmbedBuilder()
    .setColor(event.color)
    .setTitle(`${event.emoji} ${event.name}!`)
    .setDescription(`${event.msg}\n\n> ${rarityLabel(event)}`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "🍄 แต้มสปอร์", value: pointDesc, inline: true },
      { name: "💼 ยอดรวม", value: `${newPoints.toLocaleString()} สปอร์`, inline: true },
      { name: "⭐ EXP รับ", value: `+${event.exp} EXP`, inline: true },
      {
        name: `📊 Lv.${newLevel} — EXP`,
        value: `\`${bar}\` ${expLeft}/${nextLevelExp}`,
      }
    )
    .setFooter({ text: `Mushroom Kingdom 🍄 | ฟาร์มได้อีกใน 60 วินาที` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  if (leveledUp) {
    const lvEmbed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🎉 เลเวลอัป!")
      .setDescription(
        `${interaction.user} เลเวลอัปเป็น **Lv.${newLevel}** แล้ว! 🍄🎊\n` +
          `โบนัสฟาร์มเพิ่มขึ้นเป็น **+${(newLevel - 1) * 2} สปอร์** ต่อการฟาร์ม!`
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: "Mushroom Kingdom 🍄" });
    await interaction.followUp({ embeds: [lvEmbed] });
  }

  logger.info({ userId, event: event.name, pointChange, newPoints, newLevel }, "Farm result");
}

export async function executeWallet(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const player = await getOrCreatePlayer(targetUser.id);

  const nextExp = expForNextLevel(player.farmLevel);
  const bar = expBar(player.farmExp, nextExp);
  const isSelf = targetUser.id === interaction.user.id;

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`🍄 กระเป๋าสปอร์${isSelf ? "ของคุณ" : `ของ ${targetUser.displayName}`}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "💰 แต้มสปอร์", value: `**${player.sporePoints.toLocaleString()}** สปอร์`, inline: true },
      { name: "🌿 เลเวลฟาร์ม", value: `**Lv.${player.farmLevel}**`, inline: true },
      { name: "⚡ โบนัสต่อฟาร์ม", value: `+${(player.farmLevel - 1) * 2} สปอร์`, inline: true },
      {
        name: `📊 EXP — Lv.${player.farmLevel}`,
        value: `\`${bar}\` **${player.farmExp}** / **${nextExp}**`,
      }
    )
    .setFooter({ text: "Mushroom Kingdom 🍄 | ใช้ /farm เพื่อเก็บสปอร์" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeShop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const items = await getShopItems(guildId);

  const embed = new EmbedBuilder()
    .setColor(0x8b5e3c)
    .setTitle("🏪 ร้านค้าอาณาจักรเห็ด")
    .setDescription(
      items.length === 0
        ? "🚫 ร้านค้ายังไม่มีสินค้า\nแอดมินสามารถเพิ่มสินค้าด้วย `/shop-item add` ได้เลยครับ!"
        : "แลกสปอร์ที่สะสมไว้เป็นรางวัลพิเศษ! ใช้ `/buy <item_id>` เพื่อซื้อ"
    )
    .setFooter({ text: "Mushroom Kingdom 🍄 | สปอร์ดูได้ที่ /wallet" })
    .setTimestamp();

  for (const item of items) {
    const roleStatus = item.type === "role"
      ? (item.roleId ? "🎭 มอบยศอัตโนมัติ" : "⚙️ รอแอดมินตั้งค่า")
      : "📩 แอดมินดำเนินการให้หลังซื้อ";

    embed.addFields({
      name: `${item.emoji} ${item.name}`,
      value:
        `📋 **ID:** \`${item.id}\`\n` +
        `💬 ${item.description || "—"}\n` +
        `💰 **ราคา:** ${item.price.toLocaleString()} สปอร์\n` +
        `📦 ${roleStatus}`,
    });
  }

  await interaction.reply({ embeds: [embed] });
}

export async function executeBuy(interaction: ChatInputCommandInteraction): Promise<void> {
  const itemId = interaction.options.getString("item_id", true).trim();
  const guildId = interaction.guildId!;
  const item = await getShopItem(guildId, itemId);

  if (!item) {
    await interaction.reply({
      content: `❌ ไม่พบสินค้า ID \`${itemId}\`\nดูรายการสินค้าได้ที่ \`/shop\``,
      ephemeral: true,
    });
    return;
  }

  const player = await getOrCreatePlayer(interaction.user.id);

  if (player.sporePoints < item.price) {
    const needed = item.price - player.sporePoints;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle("❌ สปอร์ไม่พอ!")
          .setDescription(
            `ท่านมี **${player.sporePoints.toLocaleString()}** สปอร์ แต่ต้องการ **${item.price.toLocaleString()}** สปอร์\n` +
              `ยังขาดอีก **${needed.toLocaleString()}** สปอร์ — ไปฟาร์มเพิ่มก่อนนะครับ! 🍄`
          )
          .setFooter({ text: "Mushroom Kingdom 🍄 | /farm เพื่อเก็บสปอร์" }),
      ],
      ephemeral: true,
    });
    return;
  }

  const newPoints = player.sporePoints - item.price;

  await db
    .update(mushroomPlayersTable)
    .set({ sporePoints: newPoints })
    .where(eq(mushroomPlayersTable.userId, interaction.user.id));

  const member = interaction.member as GuildMember;
  let resultNote = "";

  if (item.type === "role" && item.roleId) {
    try {
      await member.roles.add(item.roleId);
      resultNote = `🎭 มอบยศ <@&${item.roleId}> ให้แล้ว!`;
    } catch {
      resultNote = "⚠️ ไม่สามารถมอบยศได้อัตโนมัติ กรุณาติดต่อแอดมิน";
    }
  } else if (item.type === "role") {
    resultNote = "⚙️ แอดมินยังไม่ได้ตั้งค่ายศ กรุณาติดต่อแอดมิน";
  } else {
    resultNote = "📩 แอดมินจะดำเนินการให้คุณเร็วๆ นี้!";
  }

  const successEmbed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("✅ ซื้อสำเร็จ!")
    .setDescription(`ท่านซื้อ **${item.emoji} ${item.name}** สำเร็จแล้วครับ!`)
    .addFields(
      { name: "💰 สปอร์ที่ใช้", value: `-${item.price.toLocaleString()}`, inline: true },
      { name: "💼 สปอร์คงเหลือ", value: `${newPoints.toLocaleString()}`, inline: true },
      { name: "📦 ผลลัพธ์", value: resultNote }
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: "Mushroom Kingdom 🍄" })
    .setTimestamp();

  await interaction.reply({ embeds: [successEmbed] });

  const logEmbed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🛒 บันทึกการซื้อสินค้า")
    .addFields(
      { name: "👤 ผู้ซื้อ", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
      { name: "📦 สินค้า", value: `${item.emoji} ${item.name}`, inline: true },
      { name: "💰 ราคา", value: `${item.price.toLocaleString()} สปอร์`, inline: true },
      { name: "💼 สปอร์หลังซื้อ", value: `${newPoints.toLocaleString()}`, inline: true },
      { name: "📋 หมายเหตุ", value: resultNote }
    )
    .setTimestamp();

  await sendLog(guildId, interaction.client as never, logEmbed);
  logger.info({ userId: interaction.user.id, itemId, newPoints }, "Item purchased");
}

export async function executeShopItem(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "add") {
    const name = interaction.options.getString("name", true).trim();
    const price = interaction.options.getInteger("price", true);
    const description = interaction.options.getString("description") ?? "";
    const emoji = interaction.options.getString("emoji") ?? "📦";
    const type = (interaction.options.getString("type") ?? "manual") as "role" | "manual";
    const role = interaction.options.getRole("role");

    const id = generateItemId(guildId, name);

    await db.insert(mushroomShopItemsTable).values({
      id,
      guildId,
      name,
      description,
      price,
      emoji,
      type,
      roleId: role?.id ?? null,
    });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle("✅ เพิ่มสินค้าแล้ว!")
          .addFields(
            { name: "📛 ชื่อ", value: `${emoji} ${name}`, inline: true },
            { name: "💰 ราคา", value: `${price.toLocaleString()} สปอร์`, inline: true },
            { name: "🔑 ID", value: `\`${id}\``, inline: true },
            { name: "💬 คำอธิบาย", value: description || "—" },
            { name: "📦 ประเภท", value: type === "role" ? `🎭 มอบยศ ${role ? `<@&${role.id}>` : "(ยังไม่ตั้งค่า)"}` : "📩 แมนนวล" }
          )
          .setFooter({ text: "Mushroom Kingdom 🍄 | ดูสินค้าทั้งหมดด้วย /shop" }),
      ],
      ephemeral: true,
    });

  } else if (sub === "edit") {
    const itemId = interaction.options.getString("item_id", true).trim();
    const item = await getShopItem(guildId, itemId);

    if (!item) {
      await interaction.reply({ content: `❌ ไม่พบสินค้า ID \`${itemId}\``, ephemeral: true });
      return;
    }

    const name = interaction.options.getString("name") ?? item.name;
    const price = interaction.options.getInteger("price") ?? item.price;
    const description = interaction.options.getString("description") ?? item.description;
    const emoji = interaction.options.getString("emoji") ?? item.emoji;
    const role = interaction.options.getRole("role");
    const roleId = role ? role.id : item.roleId;

    await db
      .update(mushroomShopItemsTable)
      .set({ name, price, description, emoji, roleId })
      .where(and(eq(mushroomShopItemsTable.id, itemId), eq(mushroomShopItemsTable.guildId, guildId)));

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle("✏️ แก้ไขสินค้าแล้ว!")
          .addFields(
            { name: "📛 ชื่อ", value: `${emoji} ${name}`, inline: true },
            { name: "💰 ราคา", value: `${price.toLocaleString()} สปอร์`, inline: true },
            { name: "🔑 ID", value: `\`${itemId}\``, inline: true },
            { name: "💬 คำอธิบาย", value: description || "—" },
            { name: "🎭 ยศ", value: roleId ? `<@&${roleId}>` : "—" }
          )
          .setFooter({ text: "Mushroom Kingdom 🍄" }),
      ],
      ephemeral: true,
    });

  } else if (sub === "delete") {
    const itemId = interaction.options.getString("item_id", true).trim();
    const item = await getShopItem(guildId, itemId);

    if (!item) {
      await interaction.reply({ content: `❌ ไม่พบสินค้า ID \`${itemId}\``, ephemeral: true });
      return;
    }

    await db
      .delete(mushroomShopItemsTable)
      .where(and(eq(mushroomShopItemsTable.id, itemId), eq(mushroomShopItemsTable.guildId, guildId)));

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle("🗑️ ลบสินค้าแล้ว!")
          .setDescription(`ลบ **${item.emoji} ${item.name}** ออกจากร้านค้าแล้วครับ`)
          .setFooter({ text: "Mushroom Kingdom 🍄" }),
      ],
      ephemeral: true,
    });

  } else if (sub === "list") {
    const items = await getShopItems(guildId);

    const embed = new EmbedBuilder()
      .setColor(0x8b5e3c)
      .setTitle("📋 รายการสินค้าทั้งหมด")
      .setDescription(items.length === 0 ? "ยังไม่มีสินค้า — ใช้ `/shop-item add` เพิ่มได้เลย!" : `มีสินค้าทั้งหมด **${items.length}** รายการ`)
      .setFooter({ text: "Mushroom Kingdom 🍄" });

    for (const item of items) {
      embed.addFields({
        name: `${item.emoji} ${item.name}`,
        value:
          `🔑 ID: \`${item.id}\`  💰 ${item.price.toLocaleString()} สปอร์  📦 ${item.type}\n` +
          (item.description ? `💬 ${item.description}\n` : "") +
          (item.roleId ? `🎭 ยศ: <@&${item.roleId}>` : ""),
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

export async function executeGiveSpore(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (amount <= 0) {
    await interaction.reply({ content: "❌ ต้องให้แต้มมากกว่า 0 ครับ", ephemeral: true });
    return;
  }

  const player = await getOrCreatePlayer(targetUser.id);
  const newPoints = player.sporePoints + amount;

  await db
    .update(mushroomPlayersTable)
    .set({ sporePoints: newPoints })
    .where(eq(mushroomPlayersTable.userId, targetUser.id));

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("✨ แจกสปอร์แล้ว!")
    .addFields(
      { name: "🎯 ผู้รับ", value: `${targetUser.tag}`, inline: true },
      { name: "➕ จำนวนที่ให้", value: `+${amount.toLocaleString()} สปอร์`, inline: true },
      { name: "💼 ยอดรวมใหม่", value: `${newPoints.toLocaleString()} สปอร์`, inline: true }
    )
    .setFooter({ text: `ดำเนินการโดย ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  const logEmbed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("⚡ แอดมินแจกสปอร์")
    .addFields(
      { name: "👑 แอดมิน", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
      { name: "🎯 ผู้รับ", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
      { name: "➕ จำนวน", value: `+${amount.toLocaleString()} สปอร์`, inline: true },
      { name: "💼 ยอดรวม", value: `${newPoints.toLocaleString()} สปอร์`, inline: true }
    )
    .setTimestamp();

  await sendLog(interaction.guildId!, interaction.client as never, logEmbed);
  logger.info({ adminId: interaction.user.id, targetId: targetUser.id, amount, newPoints }, "Spores given by admin");
}

export async function executeSetSpore(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (amount < 0) {
    await interaction.reply({ content: "❌ แต้มต้องไม่ติดลบครับ", ephemeral: true });
    return;
  }

  await db
    .insert(mushroomPlayersTable)
    .values({ userId: targetUser.id, sporePoints: amount })
    .onConflictDoUpdate({
      target: mushroomPlayersTable.userId,
      set: { sporePoints: amount },
    });

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🔧 ตั้งค่าสปอร์แล้ว")
    .addFields(
      { name: "🎯 ผู้เล่น", value: `${targetUser.tag}`, inline: true },
      { name: "💼 สปอร์ใหม่", value: `${amount.toLocaleString()} สปอร์`, inline: true }
    )
    .setFooter({ text: `ดำเนินการโดย ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  const logEmbed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🔧 แอดมินตั้งค่าสปอร์")
    .addFields(
      { name: "👑 แอดมิน", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
      { name: "🎯 ผู้เล่น", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
      { name: "💼 ตั้งค่าเป็น", value: `${amount.toLocaleString()} สปอร์`, inline: true }
    )
    .setTimestamp();

  await sendLog(interaction.guildId!, interaction.client as never, logEmbed);
  logger.info({ adminId: interaction.user.id, targetId: targetUser.id, amount }, "Spores set by admin");
}

export async function executeFarmConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const cfg = getGuildConfig(interaction.guildId!);

  if (sub === "log-channel") {
    cfg.logChannelId = interaction.channelId;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle("✅ ตั้งค่าห้อง Log แล้ว!")
          .setDescription(`ตั้งค่าห้อง Log เป็น <#${interaction.channelId}> แล้วครับ\nธุรกรรมทั้งหมดจะถูกส่งมาที่นี่`)
          .setFooter({ text: "Mushroom Kingdom 🍄" }),
      ],
      ephemeral: true,
    });
  } else if (sub === "info") {
    const items = await getShopItems(interaction.guildId!);
    const embed = new EmbedBuilder()
      .setColor(0x8b5e3c)
      .setTitle("⚙️ การตั้งค่ามินิเกม")
      .addFields(
        { name: "📋 ห้อง Log", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "❌ ยังไม่ตั้งค่า", inline: true },
        { name: "🏪 สินค้าในร้าน", value: `${items.length} รายการ`, inline: true }
      )
      .setFooter({ text: "Mushroom Kingdom 🍄" });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
