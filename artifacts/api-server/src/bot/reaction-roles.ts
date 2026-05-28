import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  TextChannel,
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser,
} from "discord.js";
import { logger } from "../lib/logger";

interface RoleEntry {
  emoji: string;
  emojiKey: string;
  roleId: string;
  roleName: string;
}

interface ReactionRolePanel {
  messageId: string;
  channelId: string;
  guildId: string;
  title: string;
  description: string;
  imageUrl?: string;
  exclusive: boolean;
  roles: RoleEntry[];
}

const panels = new Map<string, ReactionRolePanel>();

function panelKey(guildId: string, messageId: string): string {
  return `${guildId}:${messageId}`;
}

function getPanel(guildId: string, messageId: string): ReactionRolePanel | undefined {
  return panels.get(panelKey(guildId, messageId));
}

function setPanel(panel: ReactionRolePanel): void {
  panels.set(panelKey(panel.guildId, panel.messageId), panel);
}

function deletePanel(guildId: string, messageId: string): boolean {
  return panels.delete(panelKey(guildId, messageId));
}

function getPanelsByGuild(guildId: string): ReactionRolePanel[] {
  return Array.from(panels.values()).filter((p) => p.guildId === guildId);
}

function extractEmojiKey(emoji: string): string {
  const match = emoji.match(/<a?:\w+:(\d+)>/);
  if (match) return match[1]!;
  return emoji.trim();
}

function buildPanelEmbed(panel: ReactionRolePanel): EmbedBuilder {
  const roleLines =
    panel.roles.length > 0
      ? panel.roles.map((r) => `${r.emoji} = <@&${r.roleId}>`).join("\n")
      : "_ยังไม่มียศ — ใช้ `/reactionrole add` เพื่อเพิ่มยศ_";

  const exclusiveNote = panel.exclusive
    ? "\n\n🔒 **โหมดล็อค**: กดยศใหม่จะยึดยศเดิมอัตโนมัติ"
    : "";

  const embed = new EmbedBuilder()
    .setColor(0x8b5e3c)
    .setTitle(`🎉 | ${panel.title}`)
    .setDescription(`${roleLines}\n\n${panel.description}${exclusiveNote}`)
    .setFooter({ text: `Reaction Role 🍄 | ID: ${panel.messageId}` })
    .setTimestamp();

  if (panel.imageUrl) {
    embed.setImage(panel.imageUrl);
  }

  return embed;
}

export async function executeReactionRole(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    const title = interaction.options.getString("title", true);
    const description = interaction.options.getString("description", true);
    const imageUrl = interaction.options.getString("image") ?? undefined;
    const exclusive = interaction.options.getBoolean("exclusive") ?? false;

    const channel = interaction.channel as TextChannel;
    if (!channel || !("send" in channel)) {
      await interaction.reply({ content: "❌ ไม่สามารถส่งข้อความในห้องนี้ได้", ephemeral: true });
      return;
    }

    const tempPanel: ReactionRolePanel = {
      messageId: "temp",
      channelId: channel.id,
      guildId: interaction.guildId!,
      title,
      description,
      imageUrl,
      exclusive,
      roles: [],
    };

    const embed = buildPanelEmbed(tempPanel);
    const msg = await channel.send({ embeds: [embed] });

    const panel: ReactionRolePanel = { ...tempPanel, messageId: msg.id };
    embed.setFooter({ text: `Reaction Role 🍄 | ID: ${msg.id}` });
    await msg.edit({ embeds: [embed] });
    setPanel(panel);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle("✅ สร้างแผงรับยศแล้ว!")
          .setDescription(
            `แผงถูกสร้างในห้อง ${channel} แล้วครับ\n\n` +
              `**Message ID:** \`${msg.id}\`\n\n` +
              `ขั้นตอนถัดไป: ใช้คำสั่งด้านล่างเพื่อเพิ่มยศ\n` +
              `\`\`\`/reactionrole add message_id:${msg.id} emoji:🍄 role:@ยศ\`\`\``
          )
          .setFooter({ text: "Mushroom-Guardian-Bot 🍄" }),
      ],
      ephemeral: true,
    });
    logger.info({ messageId: msg.id, guildId: interaction.guildId, title }, "Reaction role panel created");
  } else if (sub === "add") {
    const messageId = interaction.options.getString("message_id", true).trim();
    const emoji = interaction.options.getString("emoji", true).trim();
    const role = interaction.options.getRole("role", true);

    const panel = getPanel(interaction.guildId!, messageId);
    if (!panel) {
      await interaction.reply({
        content: `❌ ไม่พบแผงรับยศ ID \`${messageId}\`\nตรวจสอบให้แน่ใจว่า Message ID ถูกต้อง`,
        ephemeral: true,
      });
      return;
    }

    const emojiKey = extractEmojiKey(emoji);
    if (panel.roles.some((r) => r.emojiKey === emojiKey)) {
      await interaction.reply({ content: `❌ อิโมจิ ${emoji} มีอยู่แล้วในแผงนี้`, ephemeral: true });
      return;
    }

    panel.roles.push({ emoji, emojiKey, roleId: role.id, roleName: role.name });

    const channel = (await interaction.guild!.channels.fetch(panel.channelId)) as TextChannel;
    const msg = await channel.messages.fetch(messageId);
    await msg.edit({ embeds: [buildPanelEmbed(panel)] });

    try {
      await msg.react(emoji);
    } catch {
      logger.warn({ emoji, messageId }, "Could not add reaction (emoji may be from another server)");
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle("✅ เพิ่มยศแล้ว!")
          .setDescription(`เพิ่ม ${emoji} = <@&${role.id}> ในแผงเรียบร้อยแล้ว`)
          .setFooter({ text: `รวม ${panel.roles.length} ยศในแผงนี้` }),
      ],
      ephemeral: true,
    });
    logger.info({ messageId, emoji, roleId: role.id }, "Reaction role entry added");
  } else if (sub === "remove") {
    const messageId = interaction.options.getString("message_id", true).trim();
    const emoji = interaction.options.getString("emoji", true).trim();

    const panel = getPanel(interaction.guildId!, messageId);
    if (!panel) {
      await interaction.reply({ content: `❌ ไม่พบแผงรับยศ ID \`${messageId}\``, ephemeral: true });
      return;
    }

    const emojiKey = extractEmojiKey(emoji);
    const idx = panel.roles.findIndex((r) => r.emojiKey === emojiKey);
    if (idx === -1) {
      await interaction.reply({ content: `❌ ไม่พบอิโมจิ ${emoji} ในแผงนี้`, ephemeral: true });
      return;
    }

    panel.roles.splice(idx, 1);

    const channel = (await interaction.guild!.channels.fetch(panel.channelId)) as TextChannel;
    const msg = await channel.messages.fetch(messageId);
    await msg.edit({ embeds: [buildPanelEmbed(panel)] });

    try {
      const reaction = msg.reactions.cache.find(
        (r) => (r.emoji.id ?? r.emoji.name ?? "") === emojiKey
      );
      await reaction?.remove();
    } catch {
      logger.warn({ emoji, messageId }, "Could not remove reaction");
    }

    await interaction.reply({ content: `✅ ลบ ${emoji} ออกจากแผงแล้ว`, ephemeral: true });
  } else if (sub === "delete") {
    const messageId = interaction.options.getString("message_id", true).trim();

    const panel = getPanel(interaction.guildId!, messageId);
    if (!panel) {
      await interaction.reply({ content: `❌ ไม่พบแผงรับยศ ID \`${messageId}\``, ephemeral: true });
      return;
    }

    try {
      const channel = (await interaction.guild!.channels.fetch(panel.channelId)) as TextChannel;
      const msg = await channel.messages.fetch(messageId);
      await msg.delete();
    } catch {
      logger.warn({ messageId }, "Could not delete panel message");
    }

    deletePanel(interaction.guildId!, messageId);
    await interaction.reply({ content: `✅ ลบแผงรับยศ \`${messageId}\` แล้ว`, ephemeral: true });
  } else if (sub === "list") {
    const allPanels = getPanelsByGuild(interaction.guildId!);

    if (allPanels.length === 0) {
      await interaction.reply({ content: "📭 ยังไม่มีแผงรับยศในเซิร์ฟเวอร์นี้", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x8b5e3c)
      .setTitle("📋 แผงรับยศทั้งหมด")
      .setDescription(
        allPanels
          .map(
            (p) =>
              `**${p.title}**\n` +
              `📍 <#${p.channelId}> | ID: \`${p.messageId}\`\n` +
              `🎭 ${p.roles.length} ยศ | ${p.exclusive ? "🔒 ล็อคยศเดียว" : "🔓 รับได้หลายยศ"}`
          )
          .join("\n\n")
      )
      .setFooter({ text: `รวม ${allPanels.length} แผง | Mushroom-Guardian-Bot 🍄` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

export async function handleReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  const message = reaction.message;
  if (!message.guild) return;

  const panel = getPanel(message.guild.id, message.id);
  if (!panel) return;

  const emojiKey = reaction.emoji.id ?? reaction.emoji.name ?? "";
  const entry = panel.roles.find((r) => r.emojiKey === emojiKey);

  if (!entry) {
    try {
      await reaction.users.remove(user.id);
    } catch { /* ignore */ }
    return;
  }

  const member = await message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  if (panel.exclusive) {
    const otherRoles = panel.roles.filter((r) => r.emojiKey !== emojiKey);
    for (const other of otherRoles) {
      if (member.roles.cache.has(other.roleId)) {
        await member.roles.remove(other.roleId).catch(() => {});
      }
      const otherReaction = message.reactions.cache.find(
        (r) => (r.emoji.id ?? r.emoji.name ?? "") === other.emojiKey
      );
      if (otherReaction) {
        await otherReaction.users.remove(user.id).catch(() => {});
      }
    }
  }

  await member.roles.add(entry.roleId).catch((err) => {
    logger.error({ err, roleId: entry.roleId, userId: user.id }, "Failed to add role");
  });
  logger.info({ userId: user.id, roleId: entry.roleId, exclusive: panel.exclusive }, "Reaction role granted");
}

export async function handleReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  const message = reaction.message;
  if (!message.guild) return;

  const panel = getPanel(message.guild.id, message.id);
  if (!panel) return;

  const emojiKey = reaction.emoji.id ?? reaction.emoji.name ?? "";
  const entry = panel.roles.find((r) => r.emojiKey === emojiKey);
  if (!entry) return;

  const member = await message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  await member.roles.remove(entry.roleId).catch((err) => {
    logger.error({ err, roleId: entry.roleId, userId: user.id }, "Failed to remove role");
  });
  logger.info({ userId: user.id, roleId: entry.roleId }, "Reaction role removed");
}
