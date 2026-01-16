"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PostCard } from "@/components/post-card";
import { Compose } from "@/components/compose";
import { Button } from "@/components/ui/button";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { use } from "react";

interface ThreadPost {
  _id: Id<"posts">;
  content: string;
  authorType: "user" | "claude";
  author: any;
  score?: number;
  categories?: string[];
  scoreReasoning?: string;
  replyCount: number;
  depth: number;
  createdAt: number;
  replies: ThreadPost[];
}

function ThreadReplies({ replies, depth }: { replies: ThreadPost[]; depth: number }) {
  if (!replies || replies.length === 0) return null;

  // Limit visual nesting to prevent infinite indentation
  const visualDepth = Math.min(depth, 4);
  const indentClass = `ml-${visualDepth * 4}`;

  return (
    <div className="mt-2">
      {replies.map((reply, index) => (
        <div key={reply._id} className="relative">
          {/* Connecting line */}
          <div
            className={`absolute left-0 top-0 bottom-0 border-l-2 border-claude/20`}
            style={{ marginLeft: `${(visualDepth - 1) * 16 + 4}px` }}
          />

          {/* Reply content with indentation */}
          <div className={indentClass}>
            <PostCard
              post={reply}
              showScore={reply.authorType === "user"}
              isReply
              depth={depth}
            />
            <ThreadReplies replies={reply.replies} depth={depth + 1} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const thread = useQuery(api.posts.getThread, {
    postId: id as Id<"posts">,
  });
  const users = useQuery(api.users.list);
  const currentUser = users?.[0];

  if (thread === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  ← Back
                </Button>
              </Link>
              <h1 className="text-xl font-bold">Thread</h1>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (thread === null) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  ← Back
                </Button>
              </Link>
              <h1 className="text-xl font-bold">Thread</h1>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          <p className="text-muted-foreground">Post not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                ← Back
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Thread</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="space-y-4">
          {/* Main post */}
          <PostCard post={thread as any} showScore={true} />

          {/* Reply composer */}
          {currentUser && (
            <div className="ml-8">
              <Compose userId={currentUser._id} parentPostId={thread._id} />
            </div>
          )}

          {/* Replies */}
          <ThreadReplies replies={thread.replies || []} depth={1} />
        </div>
      </div>
    </div>
  );
}
