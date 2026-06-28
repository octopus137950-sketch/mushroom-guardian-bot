import React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { 
  useGetBotStatus, 
  getGetBotStatusQueryKey,
  useGetBotStats,
  getGetBotStatsQueryKey,
  useHealthCheck,
  getHealthCheckQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, Users, Terminal, Activity, ArrowRight, Zap, Coins } from "lucide-react";

export function Home() {
  const { data: status, isLoading: isStatusLoading } = useGetBotStatus({
    query: { queryKey: getGetBotStatusQueryKey() }
  });
  
  const { data: stats, isLoading: isStatsLoading } = useGetBotStats({
    query: { queryKey: getGetBotStatsQueryKey() }
  });
  
  const { data: health, isLoading: isHealthLoading } = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 }
  });

  const formatUptime = (seconds: number | null) => {
    if (!seconds) return "Unknown";
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-16">
        
        {/* Hero Section */}
        <section className="relative py-20 flex flex-col items-center text-center">
          <div className="absolute inset-0 bg-primary/5 rounded-full blur-[100px] -z-10" />
          
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel mb-8 border-primary/20">
            <span className="relative flex h-3 w-3">
              {(isHealthLoading || health?.status === "ok") ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
              )}
            </span>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {isHealthLoading ? "Checking network..." : 
               health?.status === "ok" ? "Systems Active" : "Systems Offline"}
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight mb-6 max-w-4xl text-balance">
            The heart of the <span className="text-primary glow-text">Mushroom Kingdom</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mb-12 text-balance leading-relaxed">
            Manage your realms, track spore economies, and oversee your fungal guardians from the command center.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            {status?.inviteUrl ? (
              <a href={status.inviteUrl} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto rounded-full px-8 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(255,176,0,0.3)] hover:shadow-[0_0_30px_rgba(255,176,0,0.5)] transition-all">
                  Summon Guardian <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </a>
            ) : (
              <Button size="lg" disabled className="w-full sm:w-auto rounded-full px-8 text-lg">
                Summon Guardian <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            )}
            <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full px-8 text-lg border-white/10 hover:bg-white/5 glass-panel">
              View Documentation
            </Button>
          </div>
        </section>

        {/* Global Statistics */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Active Guilds" 
            value={status?.guildCount} 
            icon={Globe} 
            isLoading={isStatusLoading} 
            color="text-blue-400"
          />
          <StatCard 
            title="Total Players" 
            value={stats?.totalPlayers} 
            icon={Users} 
            isLoading={isStatsLoading}
            color="text-primary"
          />
          <StatCard 
            title="Commands Issued" 
            value={status?.commandCount} 
            icon={Terminal} 
            isLoading={isStatusLoading}
            color="text-green-400"
          />
          <StatCard 
            title="System Uptime" 
            value={formatUptime(status?.uptime ?? null)} 
            icon={Activity} 
            isLoading={isStatusLoading}
            color="text-purple-400"
            isString
          />
        </section>

        {/* Economy Overview */}
        <section className="glass-panel p-8 md:p-12 rounded-3xl glow-card overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px]" />
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="space-y-4 max-w-lg">
              <h2 className="text-3xl font-display font-bold">The Spore Economy</h2>
              <p className="text-muted-foreground text-lg">
                Monitor the flow of energy throughout the network. Spores are the lifeblood of the guardians.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-8 w-full md:w-auto">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Coins className="w-5 h-5 text-primary" />
                  <span className="font-medium uppercase tracking-wider text-sm">Total Spores</span>
                </div>
                <div className="text-4xl font-bold font-display">
                  {isStatsLoading ? <Skeleton className="h-10 w-32" /> : (stats?.totalSpores?.toLocaleString() || 0)}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Activity className="w-5 h-5 text-blue-400" />
                  <span className="font-medium uppercase tracking-wider text-sm">Transactions</span>
                </div>
                <div className="text-4xl font-bold font-display">
                  {isStatsLoading ? <Skeleton className="h-10 w-24" /> : (stats?.totalTransactions?.toLocaleString() || 0)}
                </div>
              </div>

              <div className="space-y-2 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <span className="font-medium uppercase tracking-wider text-sm">Avg Level</span>
                </div>
                <div className="text-4xl font-bold font-display">
                  {isStatsLoading ? <Skeleton className="h-10 w-24" /> : (stats?.avgLevel?.toFixed(1) || 0)}
                </div>
              </div>
            </div>
          </div>
        </section>
        
      </div>
    </AppLayout>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  isLoading, 
  color,
  isString = false 
}: { 
  title: string; 
  value: number | string | undefined; 
  icon: React.ElementType; 
  isLoading: boolean;
  color: string;
  isString?: boolean;
}) {
  return (
    <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-24 h-24 ${color.replace('text-', 'bg-')}/5 rounded-full blur-[30px] group-hover:scale-150 transition-transform duration-500`} />
      
      <div className="flex items-center gap-3 text-muted-foreground z-10">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="font-medium uppercase tracking-wider text-sm">{title}</span>
      </div>
      
      <div className="text-3xl font-display font-bold z-10">
        {isLoading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          isString ? value : (value as number)?.toLocaleString() || 0
        )}
      </div>
    </div>
  );
}
