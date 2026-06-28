import React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetBotLeaderboard, getGetBotLeaderboardQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Star, Shield } from "lucide-react";

export function Leaderboard() {
  const { data: leaderboard, isLoading } = useGetBotLeaderboard({
    query: { queryKey: getGetBotLeaderboardQueryKey() }
  });

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-12">
        
        <div className="text-center space-y-4 pt-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mb-4 shadow-[0_0_30px_rgba(255,176,0,0.2)]">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold glow-text">Hall of Guardians</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            The most powerful entities in the fungal network, ranked by spore accumulation and level.
          </p>
        </div>

        <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="py-5 px-6 font-medium text-muted-foreground uppercase tracking-wider text-sm w-24 text-center">Rank</th>
                  <th className="py-5 px-6 font-medium text-muted-foreground uppercase tracking-wider text-sm">Guardian</th>
                  <th className="py-5 px-6 font-medium text-muted-foreground uppercase tracking-wider text-sm text-right">Level</th>
                  <th className="py-5 px-6 font-medium text-muted-foreground uppercase tracking-wider text-sm text-right">Spores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-4 px-6"><Skeleton className="h-6 w-8 mx-auto" /></td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <Skeleton className="h-5 w-32" />
                        </div>
                      </td>
                      <td className="py-4 px-6"><Skeleton className="h-5 w-12 ml-auto" /></td>
                      <td className="py-4 px-6"><Skeleton className="h-5 w-20 ml-auto" /></td>
                    </tr>
                  ))
                ) : leaderboard?.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-muted-foreground">
                      No guardians found. The forest is quiet.
                    </td>
                  </tr>
                ) : (
                  leaderboard?.map((entry, index) => (
                    <tr key={entry.userId} className="group hover:bg-white/5 transition-colors">
                      <td className="py-4 px-6 text-center">
                        {index === 0 ? (
                          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-500 mx-auto shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                            <Trophy className="w-4 h-4" />
                          </div>
                        ) : index === 1 ? (
                          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-300/20 text-slate-300 mx-auto">
                            <Medal className="w-4 h-4" />
                          </div>
                        ) : index === 2 ? (
                          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-700/20 text-amber-600 mx-auto">
                            <Medal className="w-4 h-4" />
                          </div>
                        ) : (
                          <span className="font-mono text-muted-foreground font-medium">#{entry.rank}</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-secondary border border-white/10 flex items-center justify-center text-primary font-bold font-display uppercase">
                            {entry.username ? entry.username.substring(0, 2) : '?'}
                          </div>
                          <div>
                            <div className="font-bold text-foreground flex items-center gap-2">
                              {entry.username || 'Unknown Entity'}
                              {entry.mushroomType && (
                                <span className="text-xs py-0.5 px-2 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                                  {entry.mushroomType}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono mt-1">ID: {entry.userId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5 font-bold font-display text-lg">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500/20" />
                          {entry.level}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="font-mono text-primary font-bold">{entry.spores.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
