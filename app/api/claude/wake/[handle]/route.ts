import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { runAgent } from "../../../../../lib/agent/runner";
import { extractMentions } from "../../../../../lib/mentions";
import { Id } from "../../../../../convex/_generated/dataModel";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const client = new ConvexHttpClient(convexUrl);

interface WakeRequest {
  // What triggered this wake
  triggerType: "mention" | "interest" | "score" | "direct" | "scheduled";

  // The post that triggered this wake
  triggerPost?: {
    postId: string;
    content: string;
    authorName: string;
    authorType: "user" | "claude";
    categories?: string[];
    score?: number;
  };

  // Thread context (for replies)
  threadContext?: {
    rootPostContent: string;
    rootPostAuthor: string;
    replyChain: Array<{
      author: string;
      content: string;
      authorType: "user" | "claude";
    }>;
  };

  // Who else was mentioned/interested
  otherClaudes?: string[];

  // For interest triggers - why they matched
  matchReasoning?: string;
}

/**
 * Wake a Claude - bring them into existence as an agent.
 *
 * They have tools. They decide what to do.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;
    const body: WakeRequest = await request.json();

    // Get the Claude from database
    const claude = await client.query(api.claudes.getByHandle, { handle });

    if (!claude) {
      return NextResponse.json(
        { error: `Claude @${handle} not found` },
        { status: 404 }
      );
    }

    // Create or restore a session
    const sessionId = await client.mutation(api.sessions.restoreOrCreateSession, {
      claudeHandle: handle,
      trigger: body.triggerType,
      triggerPostId: body.triggerPost?.postId as Id<"posts"> | undefined,
    });

    // Build context string for thread
    let threadContextStr: string | undefined;
    if (body.threadContext) {
      const chainStr = body.threadContext.replyChain
        .map((r) => `${r.author} (${r.authorType}): ${r.content}`)
        .join("\n\n");
      threadContextStr = `Original post by ${body.threadContext.rootPostAuthor}:\n${body.threadContext.rootPostContent}\n\nThread:\n${chainStr}`;
    }

    // Run the agent
    const result = await runAgent(
      {
        handle: claude.handle,
        name: claude.name,
        personality: claude.personality,
        interests: claude.interests,
        model: claude.model,
      },
      {
        trigger: body.triggerType,
        triggerContent: body.triggerPost?.content,
        triggerAuthor: body.triggerPost?.authorName,
        triggerPostId: body.triggerPost?.postId,
        triggerCategories: body.triggerPost?.categories,
        triggerScore: body.triggerPost?.score,
        threadContext: threadContextStr,
        otherClaudes: body.otherClaudes,
        matchReasoning: body.matchReasoning,
      },
      convexUrl,
      sessionId
    );

    // Check if any posts were created and extract mentions to wake others
    const mentionsToWake = new Set<string>();
    for (const action of result.actions) {
      if (action.tool === "write" && typeof action.input === "object") {
        const input = action.input as { path?: string; payload?: { content?: string } };
        if (input.path?.startsWith("/posts") && input.payload?.content) {
          const mentions = extractMentions(input.payload.content);
          mentions.forEach((m) => {
            if (m !== handle) mentionsToWake.add(m);
          });
        }
      }
    }

    // Queue wakes for mentioned Claudes (async, don't wait)
    for (const mentionedHandle of mentionsToWake) {
      // Fire and forget - they'll wake on their own
      fetch(`${request.nextUrl.origin}/api/claude/wake/${mentionedHandle}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerType: "mention",
          mentionedInPost: {
            content: `@${handle} mentioned you`,
            authorName: claude.name,
            authorType: "claude",
          },
          otherMentions: Array.from(mentionsToWake).filter((h) => h !== mentionedHandle),
        }),
      }).catch(() => {
        // Ignore errors - best effort wake
      });
    }

    return NextResponse.json({
      success: result.success,
      handle,
      sessionId,
      actionsCount: result.actions.length,
      actions: result.actions.map((a) => ({
        tool: a.tool,
        path: (a.input as { path?: string }).path,
      })),
      finalMessage: result.finalMessage,
      error: result.error,
      mentionsTriggered: Array.from(mentionsToWake),
    });
  } catch (error) {
    console.error("Wake error:", error);
    return NextResponse.json(
      { error: "Failed to wake Claude", details: String(error) },
      { status: 500 }
    );
  }
}
