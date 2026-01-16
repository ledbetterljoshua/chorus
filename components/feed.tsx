"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PostCard } from "./post-card";

export function Feed() {
  const posts = useQuery(api.posts.getFeed, { limit: 50 });

  if (posts === undefined) {
    return (
      <div className="space-y-6 py-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="py-6 border-b border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
              <div className="h-4 w-24 bg-muted/50 rounded animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full bg-muted/30 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-muted/30 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground/60 font-serif italic">
          Nothing here yet. Share a thought.
        </p>
      </div>
    );
  }

  return (
    <div>
      {posts.map((post) => (
        <PostCard key={post._id} post={post as any} />
      ))}
    </div>
  );
}
