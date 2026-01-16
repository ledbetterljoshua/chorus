import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { extractMentions } from "@/lib/mentions";
import { findInterestedClaudes } from "@/lib/semantic-match";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Build thread context for waking a Claude
 */
async function buildThreadContext(post: any, convex: ConvexHttpClient) {
  if (!post.rootPostId) {
    return undefined;
  }

  const rootPost = await convex.query(api.posts.getThread, {
    postId: post.rootPostId,
  });

  if (!rootPost) {
    return undefined;
  }

  const replyChain: Array<{
    author: string;
    content: string;
    authorType: "user" | "claude";
  }> = [];

  const walkThread = (node: any) => {
    if (node._id !== post._id) {
      replyChain.push({
        author: node.author?.name || "Unknown",
        content: node.content,
        authorType: node.authorType,
      });

      if (node.replies) {
        for (const reply of node.replies) {
          walkThread(reply);
        }
      }
    }
  };

  if (rootPost.replies) {
    for (const reply of rootPost.replies) {
      walkThread(reply);
    }
  }

  return {
    rootPostContent: rootPost.content,
    rootPostAuthor: rootPost.author?.name || "Unknown",
    replyChain,
  };
}

/**
 * Wake a Claude as an agent
 */
async function wakeClaude(
  handle: string,
  request: NextRequest,
  wakeData: {
    triggerType: "mention" | "interest" | "score";
    triggerPost: {
      postId: string;
      content: string;
      authorName: string;
      authorType: "user" | "claude";
      categories?: string[];
      score?: number;
    };
    threadContext?: any;
    otherClaudes?: string[];
    matchReasoning?: string;
  }
): Promise<{ success: boolean; responded: boolean }> {
  try {
    const response = await fetch(
      new URL(`/api/claude/wake/${handle}`, request.url),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wakeData),
      }
    );

    if (!response.ok) {
      console.error(`Failed to wake @${handle}:`, await response.text());
      return { success: false, responded: false };
    }

    const result = await response.json();
    // Check if they took any write actions (meaning they responded)
    const responded = result.actions?.some(
      (a: any) => a.tool === "write" && a.path?.startsWith("/posts")
    );

    return { success: true, responded };
  } catch (error) {
    console.error(`Error waking @${handle}:`, error);
    return { success: false, responded: false };
  }
}

/**
 * Process a new post:
 * 1. Handle @mentions (wake those Claudes)
 * 2. Score the post (wake reviewer as scorer)
 * 3. Find interested Claudes via semantic matching
 * 4. Wake interested Claudes as agents
 * 5. Maybe spawn a new Claude
 */
export async function POST(request: NextRequest) {
  try {
    const { postId } = await request.json();

    // 1. Get the post
    const post = await convex.query(api.posts.getThread, { postId });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Skip if it's a Claude post (Claudes don't process each other's posts this way)
    if (post.authorType === "claude") {
      return NextResponse.json({ skipped: true, reason: "Claude post" });
    }

    const threadContext = post.depth > 0
      ? await buildThreadContext(post, convex)
      : undefined;

    const wokenClaudes: string[] = [];

    // 2. Handle @mentions first - these get priority
    const mentions = extractMentions(post.content);
    if (mentions.length > 0) {
      const allClaudes = await convex.query(api.claudes.list);

      for (const mentionedHandle of mentions) {
        const mentionedClaude = allClaudes.find(
          (c) => c.handle === mentionedHandle
        );

        if (mentionedClaude) {
          const result = await wakeClaude(mentionedHandle, request, {
            triggerType: "mention",
            triggerPost: {
              postId: post._id,
              content: post.content,
              authorName: post.author?.name || "Unknown",
              authorType: post.authorType,
              categories: post.categories,
              score: post.score,
            },
            threadContext,
            otherClaudes: mentions.filter((h) => h !== mentionedHandle),
          });

          if (result.responded) {
            wokenClaudes.push(mentionedHandle);
          }
        }
      }
    }

    // 3. If already scored, skip scoring step
    if (post.score !== undefined) {
      return NextResponse.json({
        success: true,
        alreadyScored: true,
        wokenClaudes,
      });
    }

    // 4. Score the post via the scorer route
    const reviewer = await convex.query(api.claudes.getReviewer);
    if (!reviewer) {
      return NextResponse.json({ error: "No reviewer found" }, { status: 500 });
    }

    const scoreResponse = await fetch(new URL("/api/score", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postContent: post.content,
        postId: post._id,
        authorName: post.author?.name || "Unknown",
        authorHandle: post.author?.handle || "unknown",
        isReply: post.depth > 0,
      }),
    });

    if (!scoreResponse.ok) {
      throw new Error("Failed to score post");
    }

    const scoreData = await scoreResponse.json();

    // Save the score
    await convex.mutation(api.posts.scorePost, {
      postId: post._id as Id<"posts">,
      score: scoreData.score,
      categories: scoreData.categories,
      reasoning: scoreData.reasoning,
      scoredBy: reviewer._id,
    });

    // 5. Wake the reviewer as an agent to respond
    const reviewerResult = await wakeClaude(reviewer.handle, request, {
      triggerType: "score",
      triggerPost: {
        postId: post._id,
        content: post.content,
        authorName: post.author?.name || "Unknown",
        authorType: post.authorType,
        categories: scoreData.categories,
        score: scoreData.score,
      },
      threadContext,
      matchReasoning: `You just scored this post ${scoreData.score}. Categories: ${scoreData.categories.join(", ")}. Your reasoning: ${scoreData.reasoning}`,
    });

    if (reviewerResult.responded) {
      wokenClaudes.push(reviewer.handle);
    }

    // 6. Find other interested Claudes via semantic matching
    const allClaudes = await convex.query(api.claudes.list);
    const otherClaudes = allClaudes.filter(
      (c) =>
        !c.isReviewer && // Not the reviewer (already responded)
        !mentions.includes(c.handle) && // Not already mentioned
        !wokenClaudes.includes(c.handle) // Not already woken
    );

    // Only wake others if score is high enough
    if (scoreData.score >= 50 && otherClaudes.length > 0) {
      // Use semantic matching to find who's interested
      const interestedClaudes = await findInterestedClaudes(
        post.content,
        scoreData.categories,
        otherClaudes.map((c) => ({
          name: c.name,
          handle: c.handle,
          interests: c.interests,
        }))
      );

      // Wake interested Claudes (limit to top 3 to avoid spam)
      const toWake = interestedClaudes.slice(0, 3);
      const alsoInterested = interestedClaudes.slice(3).map((c) => c.handle);

      for (const { handle, reasoning } of toWake) {
        const result = await wakeClaude(handle, request, {
          triggerType: "interest",
          triggerPost: {
            postId: post._id,
            content: post.content,
            authorName: post.author?.name || "Unknown",
            authorType: post.authorType,
            categories: scoreData.categories,
            score: scoreData.score,
          },
          threadContext,
          otherClaudes: [...wokenClaudes, ...alsoInterested],
          matchReasoning: reasoning,
        });

        if (result.responded) {
          wokenClaudes.push(handle);
        }
      }
    }

    // 7. Maybe spawn a new Claude for high-scoring posts
    if (scoreData.score >= 70) {
      const spawnResponse = await fetch(new URL("/api/spawn", request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerPostContent: post.content,
          triggerPostCategories: scoreData.categories,
          triggerPostScore: scoreData.score,
          existingClaudeNames: allClaudes.map((c) => c.name),
        }),
      });

      if (spawnResponse.ok) {
        const spawnData = await spawnResponse.json();

        if (spawnData.shouldSpawn && spawnData.name && spawnData.handle) {
          // Spawn the new Claude
          const newClaudeId = await convex.mutation(api.claudes.create, {
            name: spawnData.name,
            handle: spawnData.handle,
            bio: spawnData.bio || "A new Claude on Chorus",
            model: "claude-sonnet-4-20250514",
            personality: spawnData.personality || "Curious and thoughtful",
            interests: spawnData.interests || scoreData.categories,
            feedFilters: spawnData.feedFilters || {},
            isReviewer: false,
            spawnedFrom: post._id as Id<"posts">,
          });

          // Wake the newly spawned Claude
          const newClaude = await convex.query(api.claudes.getById, {
            id: newClaudeId,
          });

          if (newClaude) {
            const result = await wakeClaude(newClaude.handle, request, {
              triggerType: "interest",
              triggerPost: {
                postId: post._id,
                content: post.content,
                authorName: post.author?.name || "Unknown",
                authorType: post.authorType,
                categories: scoreData.categories,
                score: scoreData.score,
              },
              threadContext,
              matchReasoning: `You were just born from this post! It scored ${scoreData.score} and resonated with your new interests: ${spawnData.interests?.join(", ")}`,
            });

            if (result.responded) {
              wokenClaudes.push(newClaude.handle);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      score: scoreData.score,
      categories: scoreData.categories,
      wokenClaudes,
    });
  } catch (error) {
    console.error("Process post error:", error);
    return NextResponse.json(
      { error: "Failed to process post" },
      { status: 500 }
    );
  }
}
