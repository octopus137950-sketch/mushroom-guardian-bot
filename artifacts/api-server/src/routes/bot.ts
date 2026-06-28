import { Router } from "express";
import { db } from "@workspace/db";
import { mushroomPlayersTable } from "@workspace/db";
import { sql, sum, avg } from "drizzle-orm";
import { getBotState } from "../bot/state";

const router = Router();

router.get("/bot/status", async (_req, res) => {
  const state = getBotState();
  res.json(state);
});

router.get("/bot/stats", async (_req, res) => {
  try {
    const result = await db
      .select({
        totalPlayers: sql<number>`count(*)::int`,
        totalSpores: sum(mushroomPlayersTable.sporePoints),
        avgLevel: avg(mushroomPlayersTable.farmLevel),
      })
      .from(mushroomPlayersTable);

    const row = result[0];
    res.json({
      totalPlayers: row?.totalPlayers ?? 0,
      totalSpores: Number(row?.totalSpores ?? 0),
      avgLevel: Number(row?.avgLevel ?? 0),
      totalTransactions: 0,
    });
  } catch {
    res.json({ totalPlayers: 0, totalSpores: 0, avgLevel: 0, totalTransactions: 0 });
  }
});

router.get("/bot/leaderboard", async (_req, res) => {
  try {
    const rows = await db
      .select({
        userId: mushroomPlayersTable.userId,
        spores: mushroomPlayersTable.sporePoints,
        level: mushroomPlayersTable.farmLevel,
      })
      .from(mushroomPlayersTable)
      .orderBy(sql`${mushroomPlayersTable.sporePoints} DESC`)
      .limit(10);

    const entries = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      username: null,
      spores: r.spores,
      level: r.level,
      mushroomType: null,
    }));

    res.json(entries);
  } catch {
    res.json([]);
  }
});

export default router;
