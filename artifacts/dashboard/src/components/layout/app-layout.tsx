import React from "react";
import { Nav } from "./nav";
import { Footer } from "./footer";
import { ParticleBackground } from "@/components/ui/particle-background";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col relative">
      <ParticleBackground />
      <Nav />
      <main className="flex-1 pt-24 pb-12 px-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
