import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Colors,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { mushroomPlayersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getOrCreatePlayer, sendLog } from "./minigame";
import { logger } from "../lib/logger";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_BET = 10;
const MAX_BET = 50_000;

// ─── Slot Symbols ─────────────────────────────────────────────────────────────

interface SlotSymbol {
  emoji: string;
  weight: number;
  tier: number;
}

const SYMBOLS: SlotSymbol[] = [
  { emoji: "💎", weight: 3,  tier: 5 },
  { emoji: "🌟", weight: 7,  tier: 4 },
  { emoji: "🍀", weight: 10, tier: 3 },
  { emoji: "🍄", weight: 15, tier: 2 },
  { emoji: "🔰", weight: 20, tier: 1 },
  { emoji: "💠", weight: 25, tier: 0 },
  { emoji: "✳️", weight: 25, tier: 0 },
  { emoji: "🔅", weight: 25, tier: 0 },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);

const TRIPLE_TABLE: Record<number, { multiplier: number; label: string; color: number }> = {
  5: { multiplier: 15, label: "🎊 JACKPOT!! สามไดมอนด์!!",      color: 0xf1c40f },
  4: { multiplier: 8,  label: "🌟 ยอดเยี่ยม! สามดาว!",           color: 0xe67e22 },
  3: { multiplier: 6,  label: "🍀 โชคดีมาก! สามโคลเวอร์!",      color: 0x2ecc71 },
  2: { multiplier: 4,  label: "🍄 สามเห็ด! กำไรดีเลย!",          color: 0x27ae60 },
  1: { multiplier: 3,  label: "🔰 สามโล่! ไม่เลว!",              color: 0x3498db },
  0: { multiplier: 2,  label: "🎰 สามสัญลักษณ์ คืนทุน+กำไร!",   color: 0x95a5a6 },
};

interface CasinoResult {
  multiplier: number;
  label: string;
  color: number;
  isWin: boolean;
}

function spinReel(): SlotSymbol {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const sym of SYMBOLS) {
    rand -= sym.weight;
    if (rand <= 0) return sym;
  }
  return SYMBOLS[SYMBOLS.length - 1]!;
}

function computeResult(reels: [SlotSymbol, SlotSymbol, SlotSymbol]): CasinoResult {
  const [a, b, c] = reels;

  if (a.emoji === b.emoji && b.emoji === c.emoji) {
    const t = TRIPLE_TABLE[a.tier] ?? TRIPLE_TABLE[0]!;
    return { ...t, isWin: true };
  }

  const counts = new Map<string, { sym: SlotSymbol; count: number }>();
  for (const s of reels) {
    const cur = counts.get(s.emoji);
    if (cur) cur.count++;
    else counts.set(s.emoji, { sym: s, count: 1 });
  }

  for (const { sym, count } of counts.values()) {
    if (count >= 2) {
      if (sym.tier === 5) return { multiplier: 2.5, label: "💎 สองไดมอนด์! กำไรดีมาก!", color: 0xf1c40f, isWin: true };
      if (sym.tier >= 4) return { multiplier: 1.5, label: "🌟 สองดาว! กำไรนิดหน่อย",   color: 0xf39c12, isWin: true };
      if (sym.tier >= 3) return { multiplier: 1.2, label: "🍀 สองโคลเวอร์! ได้คืนบางส่วน", color: 0x7f8c8d, isWin: true };
      return { multiplier: 0, label: "💸 เสียเดิมพัน... โชคดีครั้งหน้า!", color: Colors.Red, isWin: false };
    }
  }

  return { multiplier: 0, label: "💸 เสียเดิมพัน... โชคดีครั้งหน้า!", color: Colors.Red, isWin: false };
}

// ─── /casino-setup ────────────────────────────────────────────────────────────

export async function executeCasinoSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🎰 Mushroom Casino")
    .setDescription(
      "## ยินดีต้อนรับสู่ Mushroom Casino! 🍄\n\n" +
      "ลองดวงของคุณกับสล็อตแมชชีนสุดมันส์!\n" +
      "กดปุ่ม **วางเดิมพัน** ด้านล่างเพื่อเริ่มเล่นได้เลย\n\n" +
      "**📋 ตารางรางวัล:**\n" +
      "```\n" +
      "💎 | 💎 | 💎   →  ×15  🎊 JACKPOT!!\n" +
      "🌟 | 🌟 | 🌟   →  ×8\n" +
      "🍀 | 🍀 | 🍀   →  ×6\n" +
      "🍄 | 🍄 | 🍄   →  ×4\n" +
      "🔰 | 🔰 | 🔰   →  ×3\n" +
      "💠/✳️/🔅 ×3  →  ×2\n" +
      "─────────────────────\n" +
      "💎 | 💎 | ?    →  ×2.5\n" +
      "🌟 | 🌟 | ?    →  ×1.5\n" +
      "🍀 | 🍀 | ?    →  ×1.2\n" +
      "อื่นๆ / คู่ธรรมดา →  เสียเดิมพัน\n" +
      "```\n" +
      `> เดิมพันขั้นต่ำ **${MIN_BET.toLocaleString()}** สปอร์ | สูงสุด **${MAX_BET.toLocaleString()}** สปอร์\n\n` +
      "*💡 สกุลเงิน: สปอร์ 🍄 — เล่นพอดีอย่าหักโหม!*"
    )
    .setFooter({ text: "Mushroom Kingdom 🍄 Casino • เล่นอย่างมีสติ" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("casino_bet")
      .setLabel("🎰 วางเดิมพัน")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ content: "✅ ติดตั้งแผงคาสิโนสำเร็จ!", flags: 64 });
  await (interaction.channel as TextChannel | null)?.send({ embeds: [embed], components: [row] });
}

// ─── Button: show modal ───────────────────────────────────────────────────────

export async function handleCasinoButton(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId("casino_modal")
    .setTitle("🎰 Mushroom Casino — วางเดิมพัน");

  const amountInput = new TextInputBuilder()
    .setCustomId("casino_amount")
    .setLabel(`จำนวนสปอร์ (${MIN_BET.toLocaleString()}–${MAX_BET.toLocaleString()})`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("เช่น 500")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(6);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
  await interaction.showModal(modal);
}

// ─── Modal: process bet ───────────────────────────────────────────────────────

export async function handleCasinoModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply();

  const userId = interaction.user.id;
  const rawAmount = interaction.fields.getTextInputValue("casino_amount").trim().replace(/,/g, "");
  const bet = parseInt(rawAmount, 10);

  if (isNaN(bet) || bet < MIN_BET || bet > MAX_BET) {
    const errEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("❌ จำนวนไม่ถูกต้อง")
      .setDescription(
        `กรุณาใส่ตัวเลขระหว่าง **${MIN_BET.toLocaleString()}** ถึง **${MAX_BET.toLocaleString()}** สปอร์`
      );
    await interaction.editReply({ embeds: [errEmbed] });
    return;
  }

  const player = await getOrCreatePlayer(userId);

  if (player.sporePoints < bet) {
    const brokeEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("❌ สปอร์ไม่เพียงพอ")
      .setDescription(
        `คุณมีสปอร์ **${player.sporePoints.toLocaleString()}** สปอร์\n` +
        `แต่ต้องการวางเดิมพัน **${bet.toLocaleString()}** สปอร์\n\n` +
        `💡 ลองเก็บสปอร์ก่อนด้วย \`/farm\` หรือ \`/daily\` นะครับ!`
      )
      .setThumbnail(interaction.user.displayAvatarURL());
    await interaction.editReply({ embeds: [brokeEmbed] });
    return;
  }

  const spinningEmbed = new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle("🎰 กำลังหมุน...")
    .setDescription("```\n🎰 | 🎰 | 🎰\n```\n⏳ กำลังสุ่มผล โปรดรอสักครู่...")
    .setFooter({ text: "Mushroom Casino 🍄" });
  await interaction.editReply({ embeds: [spinningEmbed] });

  await new Promise((r) => setTimeout(r, 1500));

  const reels: [SlotSymbol, SlotSymbol, SlotSymbol] = [spinReel(), spinReel(), spinReel()];
  const result = computeResult(reels);

  const winAmount = Math.floor(bet * result.multiplier);
  const netChange = winAmount - bet;
  const newPoints = Math.max(0, player.sporePoints + netChange);
  const newAllTimeHigh = Math.max(player.allTimeHigh, newPoints);

  await db
    .update(mushroomPlayersTable)
    .set({ sporePoints: newPoints, allTimeHigh: newAllTimeHigh })
    .where(eq(mushroomPlayersTable.userId, userId));

  const reelDisplay = reels.map((s) => s.emoji).join(" | ");
  const changeText =
    netChange > 0
      ? `+${netChange.toLocaleString()} สปอร์ 🎉`
      : netChange === 0
      ? `0 สปอร์ (คืนทุน)`
      : `${netChange.toLocaleString()} สปอร์ 💸`;

  let description = `\`\`\`\n${reelDisplay}\n\`\`\``;
  if (result.multiplier === 15) {
    description +=
      `\n**🎊 JACKPOT!! 🎊**\n` +
      `> วาง **${bet.toLocaleString()}** × 15 = **${winAmount.toLocaleString()} สปอร์!!**`;
  }

  const resultEmbed = new EmbedBuilder()
    .setColor(result.color)
    .setTitle(`🎰 ${result.label}`)
    .setDescription(description)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "🎯 เดิมพัน",                                   value: `${bet.toLocaleString()} สปอร์`,     inline: true },
      { name: result.isWin ? "🏆 ได้รับ" : "💀 สูญเสีย",    value: changeText,                           inline: true },
      { name: "💼 สปอร์คงเหลือ",                              value: `${newPoints.toLocaleString()} สปอร์`, inline: true }
    )
    .setFooter({ text: `Mushroom Casino 🍄 | ${interaction.user.username}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [resultEmbed] });

  const guildId = interaction.guildId;
  if (guildId) {
    const logEmbed = new EmbedBuilder()
      .setColor(result.isWin ? 0x2ecc71 : Colors.Red)
      .setTitle("🎰 คาสิโน")
      .addFields(
        { name: "👤 ผู้เล่น",     value: `${interaction.user.tag} (${userId})`,  inline: true },
        { name: "🎲 ผล",          value: reelDisplay,                            inline: true },
        { name: "💰 เดิมพัน",     value: `${bet.toLocaleString()} สปอร์`,        inline: true },
        { name: "📊 ผลลัพธ์",     value: changeText,                             inline: true }
      )
      .setTimestamp();
    await sendLog(guildId, interaction.client as never, logEmbed);
  }

  logger.info({ userId, bet, reels: reelDisplay, multiplier: result.multiplier, netChange }, "Casino spin");
}
