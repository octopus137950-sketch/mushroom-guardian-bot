import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mushroomPlayersTable = pgTable("mushroom_players", {
  userId: text("user_id").primaryKey(),
  sporePoints: integer("spore_points").notNull().default(0),
  allTimeHigh: integer("all_time_high").notNull().default(0),
  farmLevel: integer("farm_level").notNull().default(1),
  farmExp: integer("farm_exp").notNull().default(0),
  lastFarmTime: timestamp("last_farm_time"),
  lastDailyTime: timestamp("last_daily_time"),
  dailyStreak: integer("daily_streak").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMushroomPlayerSchema = createInsertSchema(mushroomPlayersTable);
export type InsertMushroomPlayer = z.infer<typeof insertMushroomPlayerSchema>;
export type MushroomPlayer = typeof mushroomPlayersTable.$inferSelect;

export const guildConfigsTable = pgTable("guild_configs", {
  guildId: text("guild_id").primaryKey(),
  welcomeChannelId: text("welcome_channel_id"),
  welcomeMessage: text("welcome_message"),
  welcomeImageUrl: text("welcome_image_url"),
  welcomeEnabled: integer("welcome_enabled").notNull().default(0),
  goodbyeChannelId: text("goodbye_channel_id"),
  goodbyeMessage: text("goodbye_message"),
  goodbyeImageUrl: text("goodbye_image_url"),
  goodbyeEnabled: integer("goodbye_enabled").notNull().default(0),
  logChannelId: text("log_channel_id"),
  farmChannelId: text("farm_channel_id"),
  casinoChannelId: text("casino_channel_id"),
  casinoPanelMessageId: text("casino_panel_message_id"),
  chatWelcomeEnabled: integer("chat_welcome_enabled").notNull().default(0),
  chatWelcomeChannelId: text("chat_welcome_channel_id"),
  chatWelcomeMessage: text("chat_welcome_message"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GuildConfig = typeof guildConfigsTable.$inferSelect;

export const mushroomShopItemsTable = pgTable("mushroom_shop_items", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull().default(0),
  emoji: text("emoji").notNull().default("📦"),
  type: text("type").notNull().default("manual"),
  roleId: text("role_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMushroomShopItemSchema = createInsertSchema(mushroomShopItemsTable);
export type InsertMushroomShopItem = z.infer<typeof insertMushroomShopItemSchema>;
export type MushroomShopItem = typeof mushroomShopItemsTable.$inferSelect;
