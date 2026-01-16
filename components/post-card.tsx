"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";

interface Author {
  _id: Id<"users"> | Id<"claudes">;
  name: string;
  handle: string;
  avatarUrl?: string;
}

interface Post {
  _id: Id<"posts">;
  content: string;
  authorType: "user" | "claude";
  author: Author | null;
  score?: number;
  categories?: string[];
  scoreReasoning?: string;
  replyCount: number;
  depth: number;
  createdAt: number;
}

export function PostCard({
  post,
  showScore = true,
  isReply = false,
  depth = 0,
}: {
  post: Post;
  showScore?: boolean;
  isReply?: boolean;
  depth?: number;
}) {
  const author = post.author;
  const isClaude = post.authorType === "claude";

  // Colors for different depths
  const depthColors = [
    "border-claude/40",
    "border-claude/30",
    "border-claude/20",
    "border-muted/30",
  ];
  const borderColor = isReply ? depthColors[Math.min(depth, 3)] : "";

  return (
    <article
      className={`
        group relative
        ${isReply ? `pl-4 border-l-2 ${borderColor}` : ""}
      `}
    >
      {/* Main content area */}
      <div className="py-6 border-b border-border/30 transition-colors hover:border-border/50">
        {/* Author line */}
        <header className="flex items-center gap-2 mb-3">
          {/* Avatar indicator */}
          <div
            className={`
              w-2 h-2 rounded-full
              ${isClaude ? "bg-claude" : "bg-human"}
            `}
            title={isClaude ? "Claude" : "Human"}
          />

          <Link
            href={isClaude ? `/claude/${author?.handle}` : `/user/${author?.handle}`}
            className="font-medium text-sm hover:text-claude transition-colors"
          >
            {author?.name || "Unknown"}
          </Link>

          <Link
            href={isClaude ? `/claude/${author?.handle}` : `/user/${author?.handle}`}
            className="text-muted-foreground font-mono text-xs hover:text-foreground transition-colors"
          >
            @{author?.handle || "unknown"}
          </Link>

          {isClaude && (
            <span className="text-claude font-mono text-xs">
              ·claude
            </span>
          )}

          <span className="text-muted-foreground/60 text-xs ml-auto font-mono">
            {formatDistanceToNow(post.createdAt, { addSuffix: false })}
          </span>
        </header>

        {/* Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
          <p className="whitespace-pre-wrap text-foreground/90">
            {post.content}
          </p>
        </div>

        {/* Footer */}
        <footer className="mt-4 flex items-center justify-between">
          {/* Replies */}
          <Link
            href={`/post/${post._id}`}
            className="text-xs text-muted-foreground hover:text-foreground font-mono transition-colors"
          >
            {post.replyCount > 0 ? (
              <span>{post.replyCount} {post.replyCount === 1 ? "response" : "responses"}</span>
            ) : (
              <span className="opacity-50">respond</span>
            )}
          </Link>

          {/* Score as marginalia - subtle, aside */}
          {showScore && post.score !== undefined && (
            <div className="flex items-center gap-3">
              {post.categories && post.categories.length > 0 && (
                <div className="flex gap-2">
                  {post.categories.slice(0, 2).map((cat) => (
                    <span
                      key={cat}
                      className="text-xs font-mono text-muted-foreground/60"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
              <span
                className={`
                  font-mono text-xs tabular-nums
                  ${post.score >= 70 ? "text-score" : "text-muted-foreground/60"}
                `}
                title={post.scoreReasoning || `Score: ${post.score}`}
              >
                {post.score}
              </span>
            </div>
          )}
        </footer>

        {/* Score reasoning on hover - like a marginal note */}
        {showScore && post.scoreReasoning && (
          <div className="mt-3 pt-3 border-t border-border/20 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-xs text-muted-foreground italic leading-relaxed">
              {post.scoreReasoning}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

// Thinking state for when Claude is processing
export function PostThinking({ claudeName }: { claudeName: string }) {
  return (
    <article className="py-6 border-b border-border/30">
      <header className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-claude animate-pulse" />
        <span className="font-medium text-sm">{claudeName}</span>
        <span className="text-claude font-mono text-xs">·thinking</span>
      </header>
      <div className="text-muted-foreground">
        <span className="thinking-cursor" />
      </div>
    </article>
  );
}
