import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from "discord.js";
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
}

// ─── Coin ID map ─────────────────────────────────────────────────────────────

const COIN_IDS: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  bnb: "binancecoin",
  binancecoin: "binancecoin",
  sol: "solana",
  solana: "solana",
  ada: "cardano",
  cardano: "cardano",
  xrp: "ripple",
  ripple: "ripple",
  doge: "dogecoin",
  dogecoin: "dogecoin",
  dot: "polkadot",
  polkadot: "polkadot",
  matic: "matic-network",
  polygon: "matic-network",
  avax: "avalanche-2",
  avalanche: "avalanche-2",
  link: "chainlink",
  chainlink: "chainlink",
  ltc: "litecoin",
  litecoin: "litecoin",
  atom: "cosmos",
  cosmos: "cosmos",
  usdt: "tether",
  tether: "tether",
  usdc: "usd-coin",
};

const COIN_SYMBOLS: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  binancecoin: "BNB",
  solana: "SOL",
  cardano: "ADA",
  ripple: "XRP",
  dogecoin: "DOGE",
  polkadot: "DOT",
  "matic-network": "MATIC",
  "avalanche-2": "AVAX",
  chainlink: "LINK",
  litecoin: "LTC",
  cosmos: "ATOM",
  tether: "USDT",
  "usd-coin": "USDC",
};

// ─── Crypto price ─────────────────────────────────────────────────────────────

export async function executeTradeCrypto(interaction: ChatInputCommandInteraction) {
  const coinInput = (interaction.options.getString("coin", true)).toLowerCase().trim();
  const coinId = COIN_IDS[coinInput] ?? coinInput;

  await interaction.deferReply();

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd,thb&include_24hr_change=true`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as CoinGeckoPrice;
    const coinData = data[coinId];

    if (!coinData || coinData.usd === undefined) {
      await interaction.editReply({
        content: `❌ ไม่พบข้อมูลเหรียญ **${coinInput.toUpperCase()}** — ลองใช้ชื่อเต็ม เช่น \`bitcoin\`, \`ethereum\`, \`solana\``,
      });
      return;
    }

    const symbol = COIN_SYMBOLS[coinId] ?? coinInput.toUpperCase();
    const priceUsd = coinData.usd;
    const priceThb = coinData.thb ?? priceUsd * 34;
    const change24h = coinData.usd_24h_change ?? 0;
    const isPositive = change24h >= 0;
    const changeEmoji = isPositive ? "📈" : "📉";
    const changeColor = isPositive ? Colors.Green : Colors.Red;

    const embed = new EmbedBuilder()
      .setColor(changeColor)
      .setTitle(`${changeEmoji} ${symbol} — ราคาคริปโตปัจจุบัน`)
      .addFields(
        { name: "💵 ราคา USD", value: `$${priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`, inline: true },
        { name: "🇹🇭 ราคา THB", value: `฿${priceThb.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inline: true },
        { name: "📊 เปลี่ยนแปลง 24h", value: `${isPositive ? "+" : ""}${change24h.toFixed(2)}%`, inline: true }
      )
      .setFooter({ text: "ข้อมูลจาก CoinGecko • อัปเดตแบบ real-time" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info({ coinId, priceUsd }, "Crypto price fetched");
  } catch (err) {
    logger.error({ err, coinInput }, "Crypto price fetch failed");
    await interaction.editReply({
      content: "❌ ไม่สามารถดึงข้อมูลราคาได้ในขณะนี้ กรุณาลองใหม่",
    });
  }
}

// ─── Forex rate ───────────────────────────────────────────────────────────────

export async function executeTradeForex(interaction: ChatInputCommandInteraction) {
  const fromRaw = (interaction.options.getString("from", true)).toUpperCase().trim();
  const toRaw = (interaction.options.getString("to", true)).toUpperCase().trim();

  await interaction.deferReply();

  try {
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(fromRaw)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Exchange rate API error: ${response.status}`);
    }

    const data = (await response.json()) as ExchangeRateResponse;

    if (data.result !== "success") {
      await interaction.editReply({
        content: `❌ ไม่พบสกุลเงิน **${fromRaw}** — ใช้รหัส ISO เช่น \`USD\`, \`THB\`, \`EUR\`, \`JPY\``,
      });
      return;
    }

    const rate = data.rates[toRaw];
    if (rate === undefined) {
      await interaction.editReply({
        content: `❌ ไม่พบสกุลเงินปลายทาง **${toRaw}**`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`💱 อัตราแลกเปลี่ยน ${fromRaw} → ${toRaw}`)
      .addFields(
        { name: "อัตราแลกเปลี่ยน", value: `1 ${fromRaw} = **${rate.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ${toRaw}**`, inline: false },
        { name: "ตัวอย่าง", value: `100 ${fromRaw} = ${(rate * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${toRaw}`, inline: false },
      )
      .setFooter({ text: "ข้อมูลจาก Open Exchange Rates" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info({ from: fromRaw, to: toRaw, rate }, "Forex rate fetched");
  } catch (err) {
    logger.error({ err, fromRaw, toRaw }, "Forex rate fetch failed");
    await interaction.editReply({
      content: "❌ ไม่สามารถดึงข้อมูลอัตราแลกเปลี่ยนได้ กรุณาลองใหม่",
    });
  }
}
