import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  GuildMember,
  Colors,
} from "discord.js";
import { logger } from "../lib/logger";
import { executeReactionRole } from "./reaction-roles";
import { executeWelcome, executeGoodbye } from "./welcome-goodbye";
import {
  executeFarm,
  executeWallet,
  executeShop,
  executeBuy,
  executeShopItem,
  executeGiveSpore,
  executeSetSpore,
  executeFarmConfig,
} from "./minigame";

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const MUSHROOM_FACTS = [
  "เส้นใยเห็ด (Mycelium) สามารถเชื่อมต่อทั้งป่าได้ — นักวิทยาศาสตร์เรียกมันว่า 'Wood Wide Web' 🌲",
  "มีเห็ดบางชนิดที่เรืองแสงในความมืดได้เลย! ✨",
  "สิ่งมีชีวิตที่ใหญ่ที่สุดบนโลกคือเชื้อราน้ำผึ้งในรัฐออริกอน กินพื้นที่กว่า 2,385 เอเคอร์! 🗺️",
  "เห็ดมีความใกล้ชิดกับสัตว์มากกว่าพืชในเชิงวิวัฒนาการ 🧬",
  "เพนิซิลลิน ยาปฏิชีวนะตัวแรก ถูกค้นพบจากราในปี 1928 💊",
  "เห็ดบางชนิดเติบโตได้เร็วถึง 1 ซม. ต่อนาทีหลังฝนตกหนัก ⚡",
  "เชื้อราสามารถย่อยสลายพลาสติกและน้ำมันได้ 🌍",
  "สปอร์ของเห็ดสามารถอยู่รอดในอวกาศได้! 🚀",
  "Death Cap (เห็ดพิษหมวกมรณะ) เป็นสาเหตุของการเสียชีวิตจากเห็ดพิษถึง 90% ⚠️",
  "Amanita muscaria (เห็ดแดงจุดขาว) คือเห็ดที่โด่งดังที่สุดในโลก 🍄",
  "เห็ดไม่มีคลอโรฟิลล์ จึงไม่สามารถสังเคราะห์แสงได้ — มันต้องกินอาหารจากสิ่งมีชีวิตอื่น 🌙",
  "ทรัฟเฟิลขาวจากอิตาลีมีราคาสูงถึง 3,600 ดอลลาร์ต่อกิโลกรัม! 💰",
];

const MUSHROOM_TYPES = [
  { name: "Chanterelle (ชานเทอแรล)", emoji: "🌼", desc: "เห็ดสีทองรูปทรงแตร มีกลิ่นหอมของผลไม้" },
  { name: "Shiitake (ชิตาเกะ)", emoji: "🍄", desc: "เห็ดยอดนิยมในอาหารเอเชีย มีรสชาติเข้มข้น" },
  { name: "Oyster (นางรม)", emoji: "🦪", desc: "เห็ดนางรม เนื้อนุ่ม รสอ่อน เหมาะทำอาหาร" },
  { name: "Lion's Mane (แผงคอสิงห์)", emoji: "🦁", desc: "เห็ดรูปทรงแปลกตา มีประโยชน์ต่อสมอง" },
  { name: "Porcini (พอร์ชินี)", emoji: "🌰", desc: "เห็ดยุโรปรสเข้ม นิยมในอาหารอิตาเลียน" },
  { name: "Morel (มอแรล)", emoji: "🏔️", desc: "เห็ดรูปรังผึ้ง หายากและราคาแพง" },
  { name: "Reishi (เรอิชิ/หลินจือ)", emoji: "🌿", desc: "เห็ดสมุนไพรจีน ใช้เป็นยามาหลายพันปี" },
  { name: "Portobello (พอร์โตเบลโล)", emoji: "🍔", desc: "เห็ดขนาดใหญ่ เนื้อหนา นิยมทดแทนเนื้อสัตว์" },
  { name: "King Oyster (นางรมราชา)", emoji: "👑", desc: "เห็ดก้านอวบ เนื้อแน่น เหมาะย่างหรือผัด" },
  { name: "Enoki (เอโนกิ)", emoji: "🌾", desc: "เห็ดเข็มทองเส้นเล็กสีขาว นิยมในอาหารญี่ปุ่น" },
];

const WARN_STORE = new Map<string, string[]>();

const mushroomCommand = new SlashCommandBuilder()
  .setName("mushroom")
  .setDescription("🍄 รับข้อมูลสนุกๆ เกี่ยวกับเห็ด")
  .addSubcommand((sub) =>
    sub.setName("fact").setDescription("🔬 รับความรู้เกี่ยวกับเห็ดแบบสุ่ม")
  )
  .addSubcommand((sub) =>
    sub.setName("type").setDescription("🍄 สุ่มชนิดเห็ดที่น่าสนใจ")
  ) as SlashCommandBuilder;

const warnCommand = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("⚠️ ตักเตือนสมาชิก")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("สมาชิกที่ต้องการตักเตือน").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("เหตุผลในการตักเตือน").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder;

const kickCommand = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("👢 เตะสมาชิกออกจากเซิร์ฟเวอร์")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("สมาชิกที่ต้องการเตะ").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("เหตุผล").setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers) as SlashCommandBuilder;

const banCommand = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("🔨 แบนสมาชิกออกจากเซิร์ฟเวอร์")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("สมาชิกที่ต้องการแบน").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("เหตุผล").setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers) as SlashCommandBuilder;

const timeoutCommand = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("🔇 ปิดเสียงสมาชิกชั่วคราว")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("สมาชิกที่ต้องการปิดเสียง").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("minutes")
      .setDescription("ระยะเวลา (นาที) สูงสุด 40320 นาที (28 วัน)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(40320)
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("เหตุผล").setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder;

const warnlistCommand = new SlashCommandBuilder()
  .setName("warnlist")
  .setDescription("📋 ดูรายการคำเตือนของสมาชิก")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("สมาชิกที่ต้องการดูประวัติ").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder;

const clearCommand = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("🧹 ลบข้อความในห้องแชท")
  .addIntegerOption((opt) =>
    opt
      .setName("amount")
      .setDescription("จำนวนข้อความที่ต้องการลบ (1–100)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) as SlashCommandBuilder;

const serverinfoCommand = new SlashCommandBuilder()
  .setName("serverinfo")
  .setDescription("📊 ดูข้อมูลเซิร์ฟเวอร์") as SlashCommandBuilder;

const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("❓ ดูคำสั่งทั้งหมดของ Mushroom-Guardian-Bot") as SlashCommandBuilder;

async function executeMushroom(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "fact") {
    const fact = MUSHROOM_FACTS[Math.floor(Math.random() * MUSHROOM_FACTS.length)];
    const embed = new EmbedBuilder()
      .setColor(0x8b5e3c)
      .setTitle("🔬 ความรู้เรื่องเห็ดประจำวัน")
      .setDescription(fact)
      .setFooter({ text: "Mushroom-Guardian-Bot 🍄" })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  } else {
    const type = MUSHROOM_TYPES[Math.floor(Math.random() * MUSHROOM_TYPES.length)];
    const embed = new EmbedBuilder()
      .setColor(0x6a4c2e)
      .setTitle(`${type.emoji} เห็ดวันนี้: ${type.name}`)
      .setDescription(type.desc)
      .setFooter({ text: "Mushroom-Guardian-Bot 🍄" })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
}

async function executeWarn(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getMember("user") as GuildMember | null;
  const reason = interaction.options.getString("reason", true);

  if (!target) {
    await interaction.reply({ content: "❌ ไม่พบสมาชิกที่ระบุ", ephemeral: true });
    return;
  }

  const key = `${interaction.guildId}:${target.id}`;
  const warns = WARN_STORE.get(key) ?? [];
  warns.push(reason);
  WARN_STORE.set(key, warns);

  const embed = new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle("⚠️ ตักเตือนสมาชิก")
    .addFields(
      { name: "สมาชิก", value: `${target}`, inline: true },
      { name: "เหตุผล", value: reason, inline: true },
      { name: "จำนวนคำเตือนทั้งหมด", value: `${warns.length} ครั้ง`, inline: true }
    )
    .setFooter({ text: `ดำเนินการโดย ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
  logger.info({ targetId: target.id, reason, warnCount: warns.length }, "Member warned");
}

async function executeKick(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getMember("user") as GuildMember | null;
  const reason = interaction.options.getString("reason") ?? "ไม่ระบุเหตุผล";

  if (!target) {
    await interaction.reply({ content: "❌ ไม่พบสมาชิกที่ระบุ", ephemeral: true });
    return;
  }

  if (!target.kickable) {
    await interaction.reply({ content: "❌ ไม่สามารถเตะสมาชิกคนนี้ได้ (อาจมีสิทธิ์สูงกว่า)", ephemeral: true });
    return;
  }

  await target.kick(reason);
  const embed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle("👢 เตะสมาชิกออกแล้ว")
    .addFields(
      { name: "สมาชิก", value: target.user.tag, inline: true },
      { name: "เหตุผล", value: reason, inline: true }
    )
    .setFooter({ text: `ดำเนินการโดย ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
  logger.info({ targetId: target.id, reason }, "Member kicked");
}

async function executeBan(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getMember("user") as GuildMember | null;
  const reason = interaction.options.getString("reason") ?? "ไม่ระบุเหตุผล";

  if (!target) {
    await interaction.reply({ content: "❌ ไม่พบสมาชิกที่ระบุ", ephemeral: true });
    return;
  }

  if (!target.bannable) {
    await interaction.reply({ content: "❌ ไม่สามารถแบนสมาชิกคนนี้ได้ (อาจมีสิทธิ์สูงกว่า)", ephemeral: true });
    return;
  }

  await target.ban({ reason });
  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle("🔨 แบนสมาชิกแล้ว")
    .addFields(
      { name: "สมาชิก", value: target.user.tag, inline: true },
      { name: "เหตุผล", value: reason, inline: true }
    )
    .setFooter({ text: `ดำเนินการโดย ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
  logger.info({ targetId: target.id, reason }, "Member banned");
}

async function executeTimeout(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getMember("user") as GuildMember | null;
  const minutes = interaction.options.getInteger("minutes", true);
  const reason = interaction.options.getString("reason") ?? "ไม่ระบุเหตุผล";

  if (!target) {
    await interaction.reply({ content: "❌ ไม่พบสมาชิกที่ระบุ", ephemeral: true });
    return;
  }

  if (!target.moderatable) {
    await interaction.reply({ content: "❌ ไม่สามารถปิดเสียงสมาชิกคนนี้ได้", ephemeral: true });
    return;
  }

  await target.timeout(minutes * 60 * 1000, reason);
  const embed = new EmbedBuilder()
    .setColor(Colors.Fuchsia)
    .setTitle("🔇 ปิดเสียงสมาชิกแล้ว")
    .addFields(
      { name: "สมาชิก", value: `${target}`, inline: true },
      { name: "ระยะเวลา", value: `${minutes} นาที`, inline: true },
      { name: "เหตุผล", value: reason, inline: true }
    )
    .setFooter({ text: `ดำเนินการโดย ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
  logger.info({ targetId: target.id, minutes, reason }, "Member timed out");
}

async function executeWarnlist(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getMember("user") as GuildMember | null;
  if (!target) {
    await interaction.reply({ content: "❌ ไม่พบสมาชิกที่ระบุ", ephemeral: true });
    return;
  }

  const key = `${interaction.guildId}:${target.id}`;
  const warns = WARN_STORE.get(key) ?? [];

  const embed = new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle(`📋 ประวัติคำเตือน: ${target.user.tag}`)
    .setDescription(
      warns.length === 0
        ? "✅ ยังไม่มีคำเตือน"
        : warns.map((w, i) => `**${i + 1}.** ${w}`).join("\n")
    )
    .setThumbnail(target.user.displayAvatarURL())
    .setFooter({ text: `รวม ${warns.length} คำเตือน` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function executeClear(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  if (!interaction.channel || !("bulkDelete" in interaction.channel)) {
    await interaction.reply({ content: "❌ ไม่สามารถลบข้อความในช่องนี้ได้", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const deleted = await interaction.channel.bulkDelete(amount, true);
  await interaction.editReply({ content: `✅ ลบข้อความแล้ว **${deleted.size}** ข้อความ` });
  logger.info({ channel: interaction.channelId, count: deleted.size }, "Messages cleared");
}

async function executeServerinfo(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "❌ ใช้คำสั่งนี้ได้ในเซิร์ฟเวอร์เท่านั้น", ephemeral: true });
    return;
  }

  const owner = await guild.fetchOwner();
  const embed = new EmbedBuilder()
    .setColor(0x5b8c5a)
    .setTitle(`📊 ${guild.name}`)
    .setThumbnail(guild.iconURL())
    .addFields(
      { name: "🆔 ID เซิร์ฟเวอร์", value: guild.id, inline: true },
      { name: "👑 เจ้าของ", value: owner.user.tag, inline: true },
      { name: "📅 สร้างเมื่อ", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
      { name: "👥 สมาชิก", value: `${guild.memberCount} คน`, inline: true },
      { name: "💬 ช่องแชท", value: `${guild.channels.cache.filter((c) => c.type === 0).size} ช่อง`, inline: true },
      { name: "🎭 โรล", value: `${guild.roles.cache.size} โรล`, inline: true }
    )
    .setFooter({ text: "Mushroom-Guardian-Bot 🍄" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function executeHelp(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0x8b5e3c)
    .setTitle("🍄 Mushroom-Guardian-Bot — คำสั่งทั้งหมด")
    .setDescription("บอทผู้พิทักษ์ดูแลเซิร์ฟเวอร์ของคุณ พร้อมความรู้เรื่องเห็ดแสนสนุก!")
    .addFields(
      {
        name: "🍄 เห็ด",
        value: "`/mushroom fact` — ความรู้เรื่องเห็ดแบบสุ่ม\n`/mushroom type` — สุ่มชนิดเห็ดน่าสนใจ",
      },
      {
        name: "🛡️ มอเดอเรชั่น",
        value:
          "`/warn <user> <reason>` — ตักเตือนสมาชิก\n`/warnlist <user>` — ดูประวัติคำเตือน\n`/kick <user>` — เตะสมาชิก\n`/ban <user>` — แบนสมาชิก\n`/timeout <user> <minutes>` — ปิดเสียงชั่วคราว\n`/clear <amount>` — ลบข้อความ",
      },
      {
        name: "📊 ข้อมูล",
        value: "`/serverinfo` — ดูข้อมูลเซิร์ฟเวอร์\n`/help` — ดูคำสั่งทั้งหมด",
      }
    )
    .setFooter({ text: "Mushroom-Guardian-Bot 🍄 | Guardian of the Mycelium Network" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

const reactionRoleCommand = new SlashCommandBuilder()
  .setName("reactionrole")
  .setDescription("🎭 ระบบรับยศผ่านการกดอิโมจิ")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("สร้างแผงรับยศใหม่ในห้องปัจจุบัน")
      .addStringOption((opt) =>
        opt.setName("title").setDescription("หัวข้อของแผง").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("คำอธิบายใต้รายการยศ").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("image").setDescription("URL ของรูปภาพ (ถ้ามี)").setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName("exclusive")
          .setDescription("ล็อคให้รับได้แค่ยศเดียว — กดยศใหม่จะยึดยศเดิม (default: false)")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("เพิ่มอิโมจิ-ยศในแผง")
      .addStringOption((opt) =>
        opt.setName("message_id").setDescription("ID ของข้อความแผง").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("emoji").setDescription("อิโมจิที่ใช้กด").setRequired(true)
      )
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("ยศที่จะได้รับ").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("ลบอิโมจิ-ยศออกจากแผง")
      .addStringOption((opt) =>
        opt.setName("message_id").setDescription("ID ของข้อความแผง").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("emoji").setDescription("อิโมจิที่ต้องการลบ").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("ลบแผงรับยศทั้งหมด")
      .addStringOption((opt) =>
        opt.setName("message_id").setDescription("ID ของข้อความแผง").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("ดูรายการแผงรับยศทั้งหมดในเซิร์ฟเวอร์")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles) as SlashCommandBuilder;

const welcomeCommand = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("🍄 ตั้งค่าระบบต้อนรับสมาชิกใหม่")
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("ตั้งค่าข้อความต้อนรับในห้องปัจจุบัน")
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("ข้อความต้อนรับ (ใช้ {user} {username} {server} {count})")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("image").setDescription("URL รูปภาพแบนเนอร์ (ถ้ามี)").setRequired(false)
      )
  )
  .addSubcommand((sub) => sub.setName("disable").setDescription("ปิดระบบต้อนรับ"))
  .addSubcommand((sub) => sub.setName("test").setDescription("ทดสอบข้อความต้อนรับในห้องนี้"))
  .addSubcommand((sub) => sub.setName("info").setDescription("ดูการตั้งค่าปัจจุบัน"))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder;

const goodbyeCommand = new SlashCommandBuilder()
  .setName("goodbye")
  .setDescription("👋 ตั้งค่าระบบลาก่อนสมาชิก")
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("ตั้งค่าข้อความลาก่อนในห้องปัจจุบัน")
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("ข้อความลาก่อน (ใช้ {user} {username} {server} {count})")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("image").setDescription("URL รูปภาพแบนเนอร์ (ถ้ามี)").setRequired(false)
      )
  )
  .addSubcommand((sub) => sub.setName("disable").setDescription("ปิดระบบลาก่อน"))
  .addSubcommand((sub) => sub.setName("test").setDescription("ทดสอบข้อความลาก่อนในห้องนี้"))
  .addSubcommand((sub) => sub.setName("info").setDescription("ดูการตั้งค่าปัจจุบัน"))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder;

// ─── Minigame commands ───────────────────────────────────────────────────────

const farmCommand = new SlashCommandBuilder()
  .setName("farm")
  .setDescription("🍄 ออกฟาร์มเก็บสปอร์เวทมนตร์ (cooldown 60 วินาที)") as SlashCommandBuilder;

const walletCommand = new SlashCommandBuilder()
  .setName("wallet")
  .setDescription("💰 ดูกระเป๋าสปอร์และสถิติของคุณ")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("ดูกระเป๋าของสมาชิกคนอื่น").setRequired(false)
  ) as SlashCommandBuilder;

const shopCommand = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("🏪 ดูร้านค้าและสินค้าที่แลกได้") as SlashCommandBuilder;

const buyCommand = new SlashCommandBuilder()
  .setName("buy")
  .setDescription("🛒 ซื้อสินค้าจากร้านค้าด้วยสปอร์")
  .addStringOption((opt) =>
    opt
      .setName("item_id")
      .setDescription("ID สินค้าที่ต้องการซื้อ (ดูได้จาก /shop)")
      .setRequired(true)
  ) as SlashCommandBuilder;

const giveSporeCommand = new SlashCommandBuilder()
  .setName("give-spore")
  .setDescription("✨ [แอดมิน] แจกสปอร์ให้สมาชิก")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("สมาชิกที่ต้องการแจกสปอร์").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt.setName("amount").setDescription("จำนวนสปอร์ที่ต้องการแจก").setRequired(true).setMinValue(1)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder;

const setSporeCommand = new SlashCommandBuilder()
  .setName("set-spore")
  .setDescription("🔧 [แอดมิน] ตั้งค่าสปอร์ของสมาชิก")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("สมาชิกที่ต้องการตั้งค่า").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt.setName("amount").setDescription("จำนวนสปอร์ที่ต้องการตั้ง").setRequired(true).setMinValue(0)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder;

const farmConfigCommand = new SlashCommandBuilder()
  .setName("farm-config")
  .setDescription("⚙️ [แอดมิน] ตั้งค่าระบบมินิเกม")
  .addSubcommand((sub) =>
    sub.setName("log-channel").setDescription("ตั้งห้องนี้เป็นห้อง Log ธุรกรรม")
  )
  .addSubcommand((sub) =>
    sub.setName("info").setDescription("ดูการตั้งค่าระบบมินิเกมปัจจุบัน")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder;

const shopItemCommand = new SlashCommandBuilder()
  .setName("shop-item")
  .setDescription("🏪 [แอดมิน] จัดการสินค้าในร้านค้า")
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("เพิ่มสินค้าใหม่เข้าร้านค้า")
      .addStringOption((opt) =>
        opt.setName("name").setDescription("ชื่อสินค้า").setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName("price").setDescription("ราคา (สปอร์)").setRequired(true).setMinValue(1)
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("คำอธิบายสินค้า").setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName("emoji").setDescription("อีโมจิประจำสินค้า (เช่น 🍄)").setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("ประเภทสินค้า")
          .setRequired(false)
          .addChoices(
            { name: "🎭 มอบยศอัตโนมัติ", value: "role" },
            { name: "📩 แมนนวล (แอดมินดำเนินการ)", value: "manual" }
          )
      )
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("ยศที่จะมอบ (เฉพาะประเภท role)").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("edit")
      .setDescription("แก้ไขข้อมูลสินค้าที่มีอยู่")
      .addStringOption((opt) =>
        opt.setName("item_id").setDescription("ID สินค้าที่ต้องการแก้ไข (ดูได้จาก /shop-item list)").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("name").setDescription("ชื่อสินค้าใหม่").setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt.setName("price").setDescription("ราคาใหม่ (สปอร์)").setRequired(false).setMinValue(1)
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("คำอธิบายใหม่").setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName("emoji").setDescription("อีโมจิใหม่").setRequired(false)
      )
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("ยศใหม่ที่จะมอบ").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("ลบสินค้าออกจากร้านค้า")
      .addStringOption((opt) =>
        opt.setName("item_id").setDescription("ID สินค้าที่ต้องการลบ").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("ดูรายการสินค้าทั้งหมดพร้อม ID")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder;

export const commands: Command[] = [
  { data: mushroomCommand, execute: executeMushroom },
  { data: warnCommand, execute: executeWarn },
  { data: kickCommand, execute: executeKick },
  { data: banCommand, execute: executeBan },
  { data: timeoutCommand, execute: executeTimeout },
  { data: warnlistCommand, execute: executeWarnlist },
  { data: clearCommand, execute: executeClear },
  { data: serverinfoCommand, execute: executeServerinfo },
  { data: helpCommand, execute: executeHelp },
  { data: reactionRoleCommand, execute: executeReactionRole },
  { data: welcomeCommand, execute: executeWelcome },
  { data: goodbyeCommand, execute: executeGoodbye },
  // Minigame
  { data: farmCommand, execute: executeFarm },
  { data: walletCommand, execute: executeWallet },
  { data: shopCommand, execute: executeShop },
  { data: buyCommand, execute: executeBuy },
  { data: giveSporeCommand, execute: executeGiveSpore },
  { data: setSporeCommand, execute: executeSetSpore },
  { data: farmConfigCommand, execute: executeFarmConfig },
  { data: shopItemCommand, execute: executeShopItem },
];
