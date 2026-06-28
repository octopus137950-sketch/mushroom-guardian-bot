import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  Colors,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { guildConfigsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoinGeckoPrice {
  [id: string]: {
    usd?: number;
    thb?: number;
    usd_24h_change?: number;
  };
}

interface ExchangeRateResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix?: number;
}

// ─── Asset definitions ────────────────────────────────────────────────────────

interface CryptoAsset {
  id: string;
  symbol: string;
  label: string;
  emoji: string;
}

interface ForexPair {
  from: string;
  to: string;
  label: string;
  emoji: string;
}

const CRYPTO_ASSETS: CryptoAsset[] = [
  { id: "bitcoin",       symbol: "BTC",  label: "Bitcoin",   emoji: "₿" },
  { id: "ethereum",      symbol: "ETH",  label: "Ethereum",  emoji: "Ξ" },
  { id: "binancecoin",   symbol: "BNB",  label: "BNB",       emoji: "🟡" },
  { id: "solana",        symbol: "SOL",  label: "Solana",    emoji: "◎" },
  { id: "ripple",        symbol: "XRP",  label: "XRP",       emoji: "✕" },
  { id: "dogecoin",      symbol: "DOGE", label: "Dogecoin",  emoji: "🐕" },
  { id: "cardano",       symbol: "ADA",  label: "Cardano",   emoji: "🔵" },
  { id: "avalanche-2",   symbol: "AVAX", label: "Avalanche", emoji: "🔺" },
  { id: "chainlink",     symbol: "LINK", label: "Chainlink", emoji: "🔗" },
  { id: "matic-network", symbol: "MATIC",label: "Polygon",   emoji: "💜" },
];

const FOREX_PAIRS: ForexPair[] = [
  { from: "USD", to: "THB", label: "USD → THB", emoji: "🇺🇸" },
  { from: "EUR", to: "THB", label: "EUR → THB", emoji: "🇪🇺" },
  { from: "JPY", to: "THB", label: "JPY → THB", emoji: "🇯🇵" },
  { from: "GBP", to: "THB", label: "GBP → THB", emoji: "🇬🇧" },
  { from: "CNY", to: "THB", label: "CNY → THB", emoji: "🇨🇳" },
  { from: "USD", to: "EUR", label: "USD → EUR", emoji: "💶" },
  { from: "USD", to: "JPY", label: "USD → JPY", emoji: "💴" },
  { from: "USD", to: "SGD", label: "USD → SGD", emoji: "🇸🇬" },
];

// ─── Buy/Sell recommendation ──────────────────────────────────────────────────

interface Recommendation {
  signal: "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
  emoji: string;
  color: number;
  reason: string;
}

function getCryptoRecommendation(change24h: number): Recommendation {
  if (change24h >= 8) {
    return {
      signal: "STRONG SELL",
      emoji: "🚨",
      color: 0xe74c3c,
      reason: "ราคาขึ้นมากผิดปกติ (+8%+) มีความเสี่ยงสูงที่จะ correction — พิจารณาขายทำกำไร",
    };
  } else if (change24h >= 3) {
    return {
      signal: "SELL",
      emoji: "📉",
      color: 0xe67e22,
      reason: "ราคาขึ้นแรง อาจถึงเวลาทำกำไรบางส่วน — ระวัง overbought",
    };
  } else if (change24h >= -2) {
    return {
      signal: "HOLD",
      emoji: "⏸️",
      color: 0xf1c40f,
      reason: "ราคาเคลื่อนไหวในกรอบปกติ — ถือรอสัญญาณที่ชัดเจนกว่านี้",
    };
  } else if (change24h >= -6) {
    return {
      signal: "BUY",
      emoji: "💚",
      color: 0x27ae60,
      reason: "ราคาลดลงปานกลาง — อาจเป็นโอกาส dip buying ที่ดี",
    };
  } else {
    return {
      signal: "STRONG BUY",
      emoji: "🔥",
      color: 0x2ecc71,
      reason: "ราคาลดลงมาก (-6%+) — โอกาสซื้อสูง แต่ระวังถ้า downtrend ยาว",
    };
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function upsertTradingConfig(
  guildId: string,
  patch: { tradingChannelId?: string | null; tradingPanelMessageId?: string | null }
): Promise<void> {
  await db
    .insert(guildConfigsTable)
    .values({ guildId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({ target: guildConfigsTable.guildId, set: { ...patch, updatedAt: new Date() } });
}

async function getTradingConfig(
  guildId: string
): Promise<{ tradingChannelId: string | null; tradingPanelMessageId: string | null } | null> {
  const rows = await db
    .select({
      tradingChannelId: guildConfigsTable.tradingChannelId,
      tradingPanelMessageId: guildConfigsTable.tradingPanelMessageId,
    })
    .from(guildConfigsTable)
    .where(eq(guildConfigsTable.guildId, guildId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Panel builder ────────────────────────────────────────────────────────────

function buildTradingPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle("💹 Mushroom Trading Panel")
    .setDescription(
      "## ยินดีต้อนรับสู่ Mushroom Trading! 🍄📈\n\n" +
      "ดูราคาสินทรัพย์ real-time พร้อมสัญญาณ **BUY / SELL**\n" +
      "กดปุ่ม **💹 เทรด** เพื่อเลือกสินทรัพย์ที่ต้องการ\n\n" +
      "**📋 สินทรัพย์ที่รองรับ:**\n" +
      "```\n" +
      "🪙 Crypto  — BTC, ETH, BNB, SOL, XRP,\n" +
      "             DOGE, ADA, AVAX, LINK, MATIC\n\n" +
      "💱 Forex   — USD/THB, EUR/THB, JPY/THB,\n" +
      "             GBP/THB, CNY/THB, USD/EUR,\n" +
      "             USD/JPY, USD/SGD\n" +
      "```\n\n" +
      "*⚠️ ข้อมูลเป็นการคาดการณ์คร่าวๆ ไม่ใช่คำแนะนำทางการเงิน*"
    )
    .setFooter({ text: "Mushroom Kingdom 🍄 Trading • ข้อมูลจาก CoinGecko & Open Exchange Rates" })
    .setTimestamp();
}

function buildAssetSelectMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  const cryptoOptions = CRYPTO_ASSETS.map((a) =>
    new StringSelectMenuOptionBuilder()
      .setValue(`crypto_${a.id}`)
      .setLabel(`${a.symbol} — ${a.label}`)
      .setDescription("คริปโตเคอร์เรนซี")
      .setEmoji("🪙")
  );

  const forexOptions = FOREX_PAIRS.map((p) =>
    new StringSelectMenuOptionBuilder()
      .setValue(`forex_${p.from}_${p.to}`)
      .setLabel(p.label)
      .setDescription("อัตราแลกเปลี่ยน")
      .setEmoji("💱")
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("trading_select")
    .setPlaceholder("เลือกสินทรัพย์ที่ต้องการดูราคา...")
    .addOptions([...cryptoOptions, ...forexOptions]);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

// ─── /trade-setup ─────────────────────────────────────────────────────────────

export async function executeTradeSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = buildTradingPanelEmbed();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("trading_trade")
      .setLabel("💹 เทรด")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.reply({ content: "✅ ติดตั้งแผงเทรดสำเร็จ!", flags: 64 });
  const msg = await (interaction.channel as TextChannel | null)?.send({ embeds: [embed], components: [row] });

  if (interaction.guildId && msg) {
    await upsertTradingConfig(interaction.guildId, {
      tradingChannelId: interaction.channelId,
      tradingPanelMessageId: msg.id,
    });
  }
  logger.info({ guildId: interaction.guildId, channelId: interaction.channelId }, "Trading panel setup");
}

// ─── /trade-remove ────────────────────────────────────────────────────────────

export async function executeTradeRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const cfg = await getTradingConfig(guildId);

  if (!cfg?.tradingChannelId) {
    await interaction.reply({ content: "❌ ยังไม่ได้ติดตั้งแผงเทรดในเซิร์ฟเวอร์นี้ครับ", flags: 64 });
    return;
  }

  try {
    if (cfg.tradingPanelMessageId) {
      const ch = interaction.guild?.channels.cache.get(cfg.tradingChannelId) as TextChannel | undefined;
      if (ch) {
        const panelMsg = await ch.messages.fetch(cfg.tradingPanelMessageId).catch(() => null);
        if (panelMsg) await panelMsg.delete();
      }
    }
  } catch {
    // ignore
  }

  await upsertTradingConfig(guildId, { tradingChannelId: null, tradingPanelMessageId: null });
  await interaction.reply({ content: `✅ ถอดแผงเทรดออกจาก <#${cfg.tradingChannelId}> แล้วครับ`, flags: 64 });
  logger.info({ guildId, channelId: cfg.tradingChannelId }, "Trading panel removed");
}

// ─── Button: show asset select menu ──────────────────────────────────────────

export async function handleTradingButton(interaction: ButtonInteraction): Promise<void> {
  const row = buildAssetSelectMenu();
  await interaction.reply({
    content: "📊 เลือกสินทรัพย์ที่ต้องการดูราคา:",
    components: [row],
    flags: 64,
  });
}

// ─── Select: fetch price and recommend ───────────────────────────────────────

export async function handleTradingSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const value = interaction.values[0];
  if (!value) return;

  await interaction.deferUpdate();

  try {
    let resultEmbed: EmbedBuilder;

    if (value.startsWith("crypto_")) {
      const coinId = value.replace("crypto_", "");
      resultEmbed = await fetchCryptoEmbed(coinId, interaction.user.username);
    } else if (value.startsWith("forex_")) {
      const [, from, to] = value.split("_");
      resultEmbed = await fetchForexEmbed(from!, to!, interaction.user.username);
    } else {
      return;
    }

    await interaction.followUp({ embeds: [resultEmbed], flags: 64 });
    logger.info({ userId: interaction.user.id, asset: value }, "Trading select");
  } catch (err) {
    logger.error({ err, asset: value }, "Trading select failed");
    await interaction.followUp({
      content: "❌ ไม่สามารถดึงข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
      flags: 64,
    });
  }
}

// ─── Fetch crypto embed ───────────────────────────────────────────────────────

async function fetchCryptoEmbed(coinId: string, username: string): Promise<EmbedBuilder> {
  const symbol = CRYPTO_ASSETS.find((a) => a.id === coinId)?.symbol ?? coinId.toUpperCase();
  const label = CRYPTO_ASSETS.find((a) => a.id === coinId)?.label ?? coinId;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd,thb&include_24hr_change=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CoinGecko ${response.status}`);

  const data = (await response.json()) as CoinGeckoPrice;
  const coinData = data[coinId];

  if (!coinData?.usd) {
    return new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("❌ ไม่พบข้อมูล")
      .setDescription(`ไม่พบข้อมูลเหรียญ **${symbol}** ลองใหม่อีกครั้ง`);
  }

  const priceUsd = coinData.usd;
  const priceThb = coinData.thb ?? priceUsd * 35;
  const change24h = coinData.usd_24h_change ?? 0;
  const rec = getCryptoRecommendation(change24h);
  const isPositive = change24h >= 0;

  return new EmbedBuilder()
    .setColor(rec.color)
    .setTitle(`${rec.emoji} ${symbol} (${label}) — ราคา Real-time`)
    .addFields(
      {
        name: "💵 ราคา USD",
        value: `$${priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`,
        inline: true,
      },
      {
        name: "🇹🇭 ราคา THB",
        value: `฿${priceThb.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        inline: true,
      },
      {
        name: "📊 เปลี่ยน 24h",
        value: `${isPositive ? "+" : ""}${change24h.toFixed(2)}%`,
        inline: true,
      },
      {
        name: `🎯 สัญญาณ: **${rec.signal}**`,
        value: rec.reason,
        inline: false,
      }
    )
    .setFooter({ text: `Mushroom Trading 🍄 | ${username} • ข้อมูลจาก CoinGecko • ไม่ใช่คำแนะนำทางการเงิน` })
    .setTimestamp();
}

// ─── Fetch forex embed ────────────────────────────────────────────────────────

async function fetchForexEmbed(from: string, to: string, username: string): Promise<EmbedBuilder> {
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ExchangeRate API ${response.status}`);

  const data = (await response.json()) as ExchangeRateResponse;

  if (data.result !== "success") {
    return new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("❌ ไม่พบสกุลเงิน")
      .setDescription(`ไม่พบข้อมูล **${from}** — ลองใหม่อีกครั้ง`);
  }

  const rate = data.rates[to];
  if (rate === undefined) {
    return new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("❌ ไม่พบสกุลเงินปลายทาง")
      .setDescription(`ไม่พบสกุลเงิน **${to}**`);
  }

  const pairLabel = FOREX_PAIRS.find((p) => p.from === from && p.to === to)?.label ?? `${from} → ${to}`;

  const usdThbRef = 34.5;
  let signal: string;
  let signalEmoji: string;
  let signalColor: number;
  let signalReason: string;

  if (from === "USD" && to === "THB") {
    if (rate > usdThbRef + 1) {
      signal = "SELL USD / BUY THB"; signalEmoji = "📉"; signalColor = 0xe67e22;
      signalReason = `USD แข็งค่ากว่าปกติ (${usdThbRef} บาท) — อาจเป็นโอกาสแลก THB ซื้อของ`;
    } else if (rate < usdThbRef - 1) {
      signal = "BUY USD / SELL THB"; signalEmoji = "💚"; signalColor = 0x27ae60;
      signalReason = `USD อ่อนค่า — โอกาสดีในการสะสม USD ไว้ใช้`;
    } else {
      signal = "HOLD"; signalEmoji = "⏸️"; signalColor = 0xf1c40f;
      signalReason = "ค่าเงินอยู่ในช่วงปกติ — ไม่มีสัญญาณชัดเจน";
    }
  } else {
    signal = "HOLD"; signalEmoji = "📊"; signalColor = 0x2ecc71;
    signalReason = "ไม่มีข้อมูล 24h change สำหรับคู่นี้ — ดูแนวโน้มระยะยาวก่อนตัดสินใจ";
  }

  return new EmbedBuilder()
    .setColor(signalColor)
    .setTitle(`${signalEmoji} ${pairLabel} — อัตราแลกเปลี่ยน Real-time`)
    .addFields(
      {
        name: "💱 อัตราปัจจุบัน",
        value: `1 ${from} = **${rate.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ${to}**`,
        inline: false,
      },
      {
        name: "📐 ตัวอย่าง",
        value: `100 ${from} = ${(rate * 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${to}`,
        inline: true,
      },
      {
        name: "1,000 " + from,
        value: `${(rate * 1000).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${to}`,
        inline: true,
      },
      {
        name: `🎯 สัญญาณ: **${signal}**`,
        value: signalReason,
        inline: false,
      }
    )
    .setFooter({ text: `Mushroom Trading 🍄 | ${username} • ข้อมูลจาก Open Exchange Rates • ไม่ใช่คำแนะนำทางการเงิน` })
    .setTimestamp();
}
