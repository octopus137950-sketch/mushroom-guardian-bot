import React from "react";
import { Link, useLocation } from "wouter";
import { Shield, Leaf, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Nav() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Command Center", icon: Shield },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 glass-panel border-b-0 border-white/10 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/40 group-hover:bg-primary/30 transition-colors animate-pulse-glow">
            <Leaf className="w-5 h-5 text-primary" />
          </div>
          <span className="font-display font-bold text-xl tracking-wide glow-text text-foreground">
            Mushroom Guardian
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => {
            const isActive = location === link.href;
            const Icon = link.icon;
            
            return (
              <Link 
                key={link.href} 
                href={link.href}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
          
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6 font-semibold shadow-[0_0_15px_rgba(255,176,0,0.4)] transition-all hover:shadow-[0_0_25px_rgba(255,176,0,0.6)]" data-testid="nav-invite-btn">
            Add to Server
          </Button>
        </div>
      </div>
    </nav>
  );
}
