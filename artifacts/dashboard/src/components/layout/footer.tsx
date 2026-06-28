import React from "react";
import { Leaf } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto py-12 px-6 border-t border-white/5 glass-panel border-x-0 border-b-0">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-muted-foreground">
        <div className="flex items-center gap-2">
          <Leaf className="w-4 h-4 text-primary opacity-70" />
          <span className="text-sm">© {new Date().getFullYear()} Mushroom Guardian. Forging fungal alliances.</span>
        </div>
        
        <div className="flex gap-6 text-sm">
          <a href="#" className="hover:text-primary transition-colors">Documentation</a>
          <a href="#" className="hover:text-primary transition-colors">Support Server</a>
          <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
        </div>
      </div>
    </footer>
  );
}
