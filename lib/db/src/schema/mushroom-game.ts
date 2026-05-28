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
