import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  PermissionFlagsBits,
  GuildMember,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import {
  mushroomPlayersTable,
  mushroomShopItemsTable,
  guildConfigsTable,
  type MushroomPlayer,
  type MushroomShopItem,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FarmEvent {
  weight: number;
  name: string;
  emoji: string;
  type: "add" | "subtract" | "percent" | "monster";
  min?: number;
  max?: number;
  percent?: number;
  winMin?: number;
  winMax?: number;
  lossMin?: number;
  lossMax?: number;
  exp: number;
  msg: string;
  color: number;
}

interface PendingFight {
  monsterName: string;
  monsterEmoji: string;
  winMin: number;
  winMax: number;
  lossMin: number;
  lossMax: number;
  exp: number;
  expiresAt: number;
}

const pendingFights = new Map<string, PendingFight>();

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
  {
    weight: 12, name: "หนอนผีเสื้อยักษ์", emoji: "🐛", type: "monster",
    winMin: 35, winMax: 65, lossMin: 15, lossMax: 30, exp: 8,
    msg: "⚠️ หนอนผีเสื้อยักษ์กัดขวางทาง! จะสู้หรือหนี?",
    color: 0x8b4513,
  },
  {
    weight: 7, name: "งูพิษเขียว", emoji: "🐍", type: "monster",
    winMin: 70, winMax: 120, lossMin: 35, lossMax: 60, exp: 12,
    msg: "⚠️ งูพิษเขียวโผล่จากพุ่มเห็ด! จะสู้หรือหนี?",
    color: 0x27ae60,
  },
  {
    weight: 3, name: "ไดโนเสาร์เห็ดโบราณ", emoji: "🦖", type: "monster",
    winMin: 150, winMax: 250, lossMin: 70, lossMax: 120, exp: 20,
    msg: "⚠️ ไดโนเสาร์เห็ดโบราณปรากฏตัว! มันหายากมาก… จะสู้หรือหนี?",
    color: 0xe74c3c,
  },
];

// ─── Guild config DB helpers ──────────────────────────────────────────────────

async function getLogChannelId(guildId: string): Promise<string | null> {
  const rows = await db
    .select({ logChannelId: guildConfigsTable.logChannelId })
    .from(guildConfigsTable)
    .where(eq(guildConfigsTable.guildId, guildId))
    .limit(1);
  return rows[0]?.logChannelId ?? null;
}

async function setLogChannelId(guildId: string, channelId: string): Promise<void> {
  await db
    .insert(guildConfigsTable)
    .values({ guildId, logChannelId: channelId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: guildConfigsTable.guildId,
      set: { logChannelId: channelId, updatedAt: new Date() },
    });
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

export async function getOrCreatePlayer(userId: string): Promise<MushroomPlayer> {
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

export async function sendLog(
  guildId: string,
  client: { guilds: { cache: Map<string, { channels: { cache: Map<string, unknown> } }> } } | null,
  embed: EmbedBuilder
): Promise<void> {
  if (!client) return;
  const logChannelId = await getLogChannelId(guildId);
  if (!logChannelId) return;
  try {
    const guild = (client.guilds.cache as Map<string, { channels: { cache: Map<string, unknown> } }>).get(guildId);
    const channel = guild?.channels.cache.get(logChannelId) as TextChannel | undefined;
    if (channel && "send" in channel) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    logger.warn({ err, guildId }, "Could not send log message");
  }
}

// ─── Command Handlers ────────────────────────────────────────────────────────

// ─── Channel restriction helper ───────────────────────────────────────────────

async function checkFarmChannel(guildId: string | null, channelId: string): Promise<boolean> {
  if (!guildId) return true;
  const rows = await db
    .select({ farmChannelId: guildConfigsTable.farmChannelId })
    .from(guildConfigsTable)
    .where(eq(guildConfigsTable.guildId, guildId))
    .limit(1);
  const farmChannelId = rows[0]?.farmChannelId;
  if (!farmChannelId) return true;
  return channelId === farmChannelId;
}

export async function executeFarm(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  const allowed = await checkFarmChannel(interaction.guildId, interaction.channelId);
  if (!allowed) {
    const rows = await db
      .select({ farmChannelId: guildConfigsTable.farmChannelId })
      .from(guildConfigsTable)
      .where(eq(guildConfigsTable.guildId, interaction.guildId!))
      .limit(1);
    const farmChannelId = rows[0]?.farmChannelId!;
    await interaction.reply({
      content: `❌ ใช้คำสั่ง \`/farm\` ได้ในห้อง <#${farmChannelId}> เท่านั้นนะครับ!`,
      flags: 64,
    });
    return;
  }

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
    await interaction.reply({ embeds: [embed], flags: 64 });
    return;
  }

  const event = rollEvent();

  // ─── Monster event: show fight/run buttons ────────────────────────────────
  if (event.type === "monster") {
    await db
      .update(mushroomPlayersTable)
      .set({ lastFarmTime: new Date() })
      .where(eq(mushroomPlayersTable.userId, userId));

    pendingFights.set(userId, {
      monsterName: event.name,
      monsterEmoji: event.emoji,
      winMin: event.winMin!,
      winMax: event.winMax!,
      lossMin: event.lossMin!,
      lossMax: event.lossMax!,
      exp: event.exp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    setTimeout(() => pendingFights.delete(userId), 5 * 60 * 1000);

    const winChance = Math.min(85, 40 + (player.farmLevel - 1) * 3);
    const embed = new EmbedBuilder()
      .setColor(event.color)
      .setTitle(`${event.emoji} ${event.name} ปรากฏตัว!`)
      .setDescription(`${event.msg}\n\n> ${rarityLabel(event)}`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: "⚔️ โอกาสชนะ", value: `${winChance}%`, inline: true },
        { name: "🏆 รางวัลถ้าชนะ", value: `+${event.winMin}~${event.winMax} สปอร์`, inline: true },
        { name: "💀 เสียถ้าแพ้", value: `-${event.lossMin}~${event.lossMax} สปอร์`, inline: true },
      )
      .setFooter({ text: "⏰ มีเวลา 5 นาทีในการตัดสินใจ" })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`monster_fight_${userId}`)
        .setLabel("⚔️ สู้!")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`monster_run_${userId}`)
        .setLabel("🏃 หนี!")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    logger.info({ userId, monster: event.name }, "Monster encounter");
    return;
  }

  // ─── Normal event ─────────────────────────────────────────────────────────
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

  const newAllTimeHigh = Math.max(player.allTimeHigh, newPoints);

  await db
    .update(mushroomPlayersTable)
    .set({
      sporePoints: newPoints,
      allTimeHigh: newAllTimeHigh,
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

// ─── Monster fight/run button handler ────────────────────────────────────────

export async function handleMonsterButton(interaction: ButtonInteraction): Promise<void> {
  const isFight = interaction.customId.startsWith("monster_fight_");
  const userId = interaction.customId.replace(/^monster_(fight|run)_/, "");

  if (interaction.user.id !== userId) {
    await interaction.reply({ content: "❌ นี่ไม่ใช่การต่อสู้ของท่านนะครับ!", flags: 64 });
    return;
  }

  const fight = pendingFights.get(userId);
  if (!fight || Date.now() > fight.expiresAt) {
    await interaction.update({ components: [] });
    await interaction.followUp({ content: "⏰ หมดเวลาแล้ว มอนสเตอร์หนีไปแล้ว!", flags: 64 });
    return;
  }

  pendingFights.delete(userId);
  const player = await getOrCreatePlayer(userId);

  if (!isFight) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Grey)
      .setTitle("🏃 หนีสำเร็จ!")
      .setDescription(`ท่านรีบวิ่งหนี **${fight.monsterEmoji} ${fight.monsterName}** อย่างรวดเร็ว!\nโชคดีที่ไม่เสียสปอร์ แต่ก็ไม่ได้อะไรเหมือนกัน`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields({ name: "💼 สปอร์คงเหลือ", value: `${player.sporePoints.toLocaleString()} สปอร์`, inline: true })
      .setFooter({ text: "Mushroom Kingdom 🍄 | บางทีหนีก็เป็นทางเลือกที่ดี" });
    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  const winChance = Math.min(85, 40 + (player.farmLevel - 1) * 3);
  const isWin = Math.random() * 100 < winChance;

  let pointChange: number;
  let newExp = player.farmExp + fight.exp;
  let newLevel = player.farmLevel;
  let leveledUp = false;
  let expLeft = newExp;

  if (isWin) {
    pointChange = randInt(fight.winMin, fight.winMax) + (player.farmLevel - 1) * 2;
  } else {
    pointChange = -randInt(fight.lossMin, fight.lossMax);
  }

  while (expLeft >= expForNextLevel(newLevel)) {
    expLeft -= expForNextLevel(newLevel);
    newLevel++;
    leveledUp = true;
  }

  const newPoints = Math.max(0, player.sporePoints + pointChange);
  const newAllTimeHigh = Math.max(player.allTimeHigh, newPoints);

  await db
    .update(mushroomPlayersTable)
    .set({ sporePoints: newPoints, allTimeHigh: newAllTimeHigh, farmExp: expLeft, farmLevel: newLevel })
    .where(eq(mushroomPlayersTable.userId, userId));

  const bar = expBar(expLeft, expForNextLevel(newLevel));
  const embed = new EmbedBuilder()
    .setColor(isWin ? 0x2ecc71 : Colors.Red)
    .setTitle(isWin ? `⚔️ ชนะ! ${fight.monsterEmoji} ${fight.monsterName} ล้มลง!` : `💀 แพ้! ${fight.monsterEmoji} ${fight.monsterName} แข็งแกร่งเกินไป!`)
    .setDescription(
      isWin
        ? `ท่านสู้กับ **${fight.monsterName}** และได้รับชัยชนะ! มันวิ่งหนีพร้อมทิ้งสปอร์เอาไว้!`
        : `ท่านสู้กับ **${fight.monsterName}** แต่พ่ายแพ้ มันหนีไปพร้อมสปอร์บางส่วนของท่าน...`
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: isWin ? "🏆 ได้รับ" : "💸 เสียไป", value: `${isWin ? "+" : ""}${pointChange.toLocaleString()} สปอร์`, inline: true },
      { name: "💼 สปอร์รวม", value: `${newPoints.toLocaleString()} สปอร์`, inline: true },
      { name: `📊 Lv.${newLevel} EXP`, value: `\`${bar}\` ${expLeft}/${expForNextLevel(newLevel)}`, inline: true },
    )
    .setFooter({ text: "Mushroom Kingdom 🍄" })
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });

  if (leveledUp) {
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("🎉 เลเวลอัป!")
          .setDescription(`เลเวลอัปเป็น **Lv.${newLevel}** แล้ว! 🍄🎊`)
      ],
    });
  }

  logger.info({ userId, monster: fight.monsterName, isWin, pointChange, newPoints }, "Monster fight result");
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
  const newAllTimeHigh = Math.max(player.allTimeHigh, newPoints);

  await db
    .update(mushroomPlayersTable)
    .set({ sporePoints: newPoints, allTimeHigh: newAllTimeHigh })
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

  const existing = await getOrCreatePlayer(targetUser.id);
  const newAllTimeHigh = Math.max(existing.allTimeHigh, amount);

  await db
    .insert(mushroomPlayersTable)
    .values({ userId: targetUser.id, sporePoints: amount, allTimeHigh: newAllTimeHigh })
    .onConflictDoUpdate({
      target: mushroomPlayersTable.userId,
      set: { sporePoints: amount, allTimeHigh: newAllTimeHigh },
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

export async function executeDaily(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const player = await getOrCreatePlayer(userId);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // วันนี้ 00:00
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000); // เมื่อวาน 00:00

  const lastDaily = player.lastDailyTime ? new Date(player.lastDailyTime) : null;

  // ถ้าเช็คอินวันนี้ไปแล้ว
  if (lastDaily && lastDaily >= todayStart) {
    const nextReset = new Date(todayStart.getTime() + 86_400_000);
    const remainSec = Math.ceil((nextReset.getTime() - now.getTime()) / 1000);
    const hours = Math.floor(remainSec / 3600);
    const mins = Math.floor((remainSec % 3600) / 60);

    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("⏳ เช็คอินแล้ววันนี้!")
      .setDescription(
        `ท่านเช็คอินวันนี้ไปแล้วครับ!\nรอถึงเที่ยงคืนจึงจะเช็คอินใหม่ได้\n\n⏰ อีก **${hours} ชั่วโมง ${mins} นาที**`
      )
      .addFields(
        { name: "🔥 สตรีคปัจจุบัน", value: `${player.dailyStreak} วันติดต่อกัน`, inline: true },
        { name: "💰 สปอร์ที่มี", value: `${player.sporePoints.toLocaleString()} สปอร์`, inline: true }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: "Mushroom Kingdom 🍄 | กลับมาพรุ่งนี้นะครับ!" });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // คำนวณ streak
  const isConsecutive = lastDaily && lastDaily >= yesterdayStart;
  const newStreak = isConsecutive ? player.dailyStreak + 1 : 1;
  const reward = newStreak * 25;
  const newPoints = player.sporePoints + reward;
  const newAllTimeHigh = Math.max(player.allTimeHigh, newPoints);

  await db
    .update(mushroomPlayersTable)
    .set({
      sporePoints: newPoints,
      allTimeHigh: newAllTimeHigh,
      lastDailyTime: now,
      dailyStreak: newStreak,
    })
    .where(eq(mushroomPlayersTable.userId, userId));

  // ข้อความพิเศษตาม streak
  let streakMsg = "";
  if (newStreak >= 30) streakMsg = "🌟 ตำนาน! 30 วันติดต่อกัน!! สุดยอดมากครับ!";
  else if (newStreak >= 14) streakMsg = "💎 เจ๋งมาก! 2 สัปดาห์ติดต่อกัน!";
  else if (newStreak >= 7) streakMsg = "🔥 ครบ 1 สัปดาห์แล้ว! ไม่หยุดเลย!";
  else if (newStreak >= 3) streakMsg = "⚡ กำลังดีเลย! อย่าหยุด!";
  else if (newStreak === 1 && player.dailyStreak > 1) streakMsg = `💔 โอ้โห! สตรีค ${player.dailyStreak} วันหายไปแล้ว... เริ่มใหม่กันเถอะ!`;
  else streakMsg = "🍄 เริ่มต้นดีมาก! กลับมาพรุ่งนี้ด้วยนะครับ";

  // วันถัดไปจะได้เท่าไหร่
  const nextReward = (newStreak + 1) * 25;

  const embed = new EmbedBuilder()
    .setColor(newStreak >= 7 ? 0xf1c40f : 0x2ecc71)
    .setTitle(`${newStreak >= 7 ? "🔥" : "✅"} เช็คอินสำเร็จ! วันที่ ${newStreak}`)
    .setDescription(streakMsg)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "🍄 สปอร์ที่ได้รับ", value: `**+${reward.toLocaleString()}** สปอร์`, inline: true },
      { name: "💼 สปอร์รวม", value: `**${newPoints.toLocaleString()}** สปอร์`, inline: true },
      { name: "🔥 สตรีค", value: `**${newStreak}** วันติดต่อกัน`, inline: true },
      {
        name: "📅 พรุ่งนี้",
        value: newStreak === 1
          ? `เช็คอินวันพรุ่งนี้รับ **+${nextReward} สปอร์** (วันที่ 2)\nอย่าลืมมาด้วยนะครับ! 🍄`
          : `เช็คอินต่อเนื่องรับ **+${nextReward} สปอร์** (วันที่ ${newStreak + 1})`,
      }
    )
    .setFooter({ text: "Mushroom Kingdom 🍄 | เช็คอินได้วันละ 1 ครั้ง รีเซ็ตตอนเที่ยงคืน" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  const logEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("📅 เช็คอินรายวัน")
    .addFields(
      { name: "👤 ผู้เล่น", value: `${interaction.user.tag} (${userId})`, inline: true },
      { name: "🔥 สตรีค", value: `${newStreak} วัน`, inline: true },
      { name: "🍄 รางวัล", value: `+${reward} สปอร์`, inline: true }
    )
    .setTimestamp();

  await sendLog(interaction.guildId!, interaction.client as never, logEmbed);
  logger.info({ userId, streak: newStreak, reward, newPoints }, "Daily check-in");
}

export async function executeChannelConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "set-farm") {
    await db
      .insert(guildConfigsTable)
      .values({ guildId, farmChannelId: interaction.channelId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: guildConfigsTable.guildId, set: { farmChannelId: interaction.channelId, updatedAt: new Date() } });
    await interaction.reply({
      content: `✅ ตั้งช่อง <#${interaction.channelId}> เป็นช่องฟาร์มเห็ดแล้ว!\nคำสั่ง \`/farm\` จะใช้ได้เฉพาะในช่องนี้เท่านั้น`,
      flags: 64,
    });

  } else if (sub === "reset-farm") {
    await db
      .insert(guildConfigsTable)
      .values({ guildId, farmChannelId: null, updatedAt: new Date() })
      .onConflictDoUpdate({ target: guildConfigsTable.guildId, set: { farmChannelId: null, updatedAt: new Date() } });
    await interaction.reply({ content: "✅ ยกเลิกข้อจำกัดช่องฟาร์มแล้ว ใช้ `/farm` ได้ทุกช่อง", flags: 64 });

  } else if (sub === "info") {
    const rows = await db
      .select({ farmChannelId: guildConfigsTable.farmChannelId, casinoChannelId: guildConfigsTable.casinoChannelId })
      .from(guildConfigsTable)
      .where(eq(guildConfigsTable.guildId, guildId))
      .limit(1);
    const cfg = rows[0];
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("📍 การตั้งค่าช่องระบบต่างๆ")
      .addFields(
        { name: "🌿 ช่องฟาร์มเห็ด", value: cfg?.farmChannelId ? `<#${cfg.farmChannelId}>` : "ไม่จำกัด (ทุกช่อง)", inline: true },
        { name: "🎰 ช่องคาสิโน", value: cfg?.casinoChannelId ? `<#${cfg.casinoChannelId}>` : "ยังไม่ตั้งค่า", inline: true },
      )
      .setFooter({ text: "Mushroom-Guardian-Bot 🍄" });
    await interaction.reply({ embeds: [embed], flags: 64 });
  }
}

export async function executeLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const type = (interaction.options.getString("type") ?? "current") as "current" | "alltime";

  await interaction.deferReply();

  const rows = await db
    .select()
    .from(mushroomPlayersTable)
    .orderBy(desc(type === "alltime" ? mushroomPlayersTable.allTimeHigh : mushroomPlayersTable.sporePoints))
    .limit(10);

  if (rows.length === 0) {
    await interaction.editReply({ content: "🍄 ยังไม่มีข้อมูลผู้เล่นในระบบ ใช้ `/farm` เพื่อเริ่มต้นได้เลย!" });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const title = type === "alltime" ? "🏆 อันดับสปอร์สูงสุดตลอดกาล" : "🍄 อันดับสปอร์ตอนนี้";

  const lines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const medal = medals[i] ?? `**${i + 1}.**`;
    const spores = type === "alltime" ? row.allTimeHigh : row.sporePoints;
    lines.push(`${medal} <@${row.userId}> — **${spores.toLocaleString()}** สปอร์  *(Lv.${row.farmLevel})*`);
  }

  const embed = new EmbedBuilder()
    .setColor(type === "alltime" ? 0xf1c40f : 0x2ecc71)
    .setTitle(title)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Mushroom Kingdom 🍄 | อัปเดต: ${new Date().toLocaleTimeString("th-TH")}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export async function executeFarmConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "log-channel") {
    await setLogChannelId(guildId, interaction.channelId);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle("✅ ตั้งค่าห้อง Log แล้ว!")
          .setDescription(`ตั้งค่าห้อง Log เป็น <#${interaction.channelId}> แล้วครับ\nธุรกรรมทั้งหมดจะถูกส่งมาที่นี่`)
          .setFooter({ text: "Mushroom Kingdom 🍄" }),
      ],
      flags: 64,
    });
  } else if (sub === "info") {
    const [items, logChannelId] = await Promise.all([
      getShopItems(guildId),
      getLogChannelId(guildId),
    ]);
    const embed = new EmbedBuilder()
      .setColor(0x8b5e3c)
      .setTitle("⚙️ การตั้งค่ามินิเกม")
      .addFields(
        { name: "📋 ห้อง Log", value: logChannelId ? `<#${logChannelId}>` : "❌ ยังไม่ตั้งค่า", inline: true },
        { name: "🏪 สินค้าในร้าน", value: `${items.length} รายการ`, inline: true }
      )
      .setFooter({ text: "Mushroom Kingdom 🍄" });
    await interaction.reply({ embeds: [embed], flags: 64 });
  }
}
