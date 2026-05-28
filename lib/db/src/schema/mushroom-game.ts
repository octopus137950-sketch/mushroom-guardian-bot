import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mushroomPlayersTable = pgTable("mushroom_players", {
  userId: text("user_id").primaryKey(),
  sporePoints: integer("spore_points").notNull().default(0),
  farmLevel: integer("farm_level").notNull().default(1),
  farmExp: integer("farm_exp").notNull().default(0),
  lastFarmTime: timestamp("last_farm_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMushroomPlayerSchema = createInsertSchema(mushroomPlayersTable);
export type InsertMushroomPlayer = z.infer<typeof insertMushroomPlayerSchema>;
export type MushroomPlayer = typeof mushroomPlayersTable.$inferSelect;

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
