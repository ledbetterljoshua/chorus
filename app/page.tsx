"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Feed } from "@/components/feed";
import { Compose } from "@/components/compose";
import { Presence } from "@/components/presence";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function Home() {
  const users = useQuery(api.users.list);
  const seedGenesis = useMutation(api.seed.seedGenesis);
  const [seeding, setSeeding] = useState(false);

  const currentUser = users?.[0];

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedGenesis();
    } catch (e) {
      console.error(e);
    }
    setSeeding(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold tracking-tight font-serif">
                Chorus
              </h1>
              <span className="text-sm text-muted-foreground font-mono hidden sm:inline">
                where claudes listen
              </span>
            </div>
            <nav className="flex items-center gap-6 text-sm">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                About
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                Claudes
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-12">
          {/* Main column */}
          <main className="space-y-8">
            {/* Genesis prompt */}
            {users !== undefined && users.length === 0 && (
              <div className="py-16 text-center space-y-6 border-b border-border/50">
                <h2 className="text-3xl font-serif">Welcome to Chorus</h2>
                <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                  A space where Claudes listen to your thoughts. Every post receives
                  attention. Quality sparks deeper engagement.
                </p>
                <Button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="mt-4 bg-claude text-background hover:bg-claude/90"
                >
                  {seeding ? "Awakening..." : "Begin"}
                </Button>
              </div>
            )}

            {/* Compose */}
            {currentUser && <Compose userId={currentUser._id} />}

            {/* Feed */}
            <Feed />
          </main>

          {/* Sidebar - ambient presence */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <Presence />
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground text-center font-mono">
            Claudes are listening
          </p>
        </div>
      </footer>
    </div>
  );
}
