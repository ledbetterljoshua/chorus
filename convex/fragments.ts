import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a memory fragment
export const createFragment = mutation({
  args: {
    claudeHandle: v.string(),
    content: v.string(),
    fragmentType: v.union(
      v.literal("conversation"),
      v.literal("decision"),
      v.literal("insight"),
      v.literal("question")
    ),
    importance: v.number(),
    relatedPostIds: v.optional(v.array(v.id("posts"))),
    relatedClaudeHandles: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const fragmentId = await ctx.db.insert("memoryFragments", {
      claudeHandle: args.claudeHandle,
      content: args.content,
      fragmentType: args.fragmentType,
      importance: args.importance,
      relatedPostIds: args.relatedPostIds,
      relatedClaudeHandles: args.relatedClaudeHandles,
      embedding: args.embedding,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
    });

    return fragmentId;
  },
});

// Update fragment importance (for decay)
export const updateFragmentImportance = mutation({
  args: {
    fragmentId: v.id("memoryFragments"),
    importance: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fragmentId, {
      importance: args.importance,
    });

    return { success: true };
  },
});

// Record fragment access (for tracking what's being retrieved)
export const recordFragmentAccess = mutation({
  args: {
    fragmentId: v.id("memoryFragments"),
  },
  handler: async (ctx, args) => {
    const fragment = await ctx.db.get(args.fragmentId);
    if (!fragment) return { success: false };

    await ctx.db.patch(args.fragmentId, {
      accessCount: fragment.accessCount + 1,
      lastAccessedAt: Date.now(),
    });

    return { success: true };
  },
});

// Get fragments for a Claude
export const getFragments = query({
  args: {
    claudeHandle: v.string(),
    fragmentType: v.optional(
      v.union(
        v.literal("conversation"),
        v.literal("decision"),
        v.literal("insight"),
        v.literal("question")
      )
    ),
    minImportance: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let fragments;

    if (args.fragmentType) {
      const fragmentType = args.fragmentType;
      fragments = await ctx.db
        .query("memoryFragments")
        .withIndex("by_type", (q) =>
          q
            .eq("claudeHandle", args.claudeHandle)
            .eq("fragmentType", fragmentType)
        )
        .collect();
    } else {
      fragments = await ctx.db
        .query("memoryFragments")
        .withIndex("by_claude", (q) =>
          q.eq("claudeHandle", args.claudeHandle)
        )
        .collect();
    }

    // Filter by importance if specified
    if (args.minImportance !== undefined) {
      const minImportance = args.minImportance;
      fragments = fragments.filter((f) => f.importance >= minImportance);
    }

    // Sort by importance (descending) then by creation time (descending)
    fragments.sort((a, b) => {
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return b.createdAt - a.createdAt;
    });

    return fragments.slice(0, limit);
  },
});

// Get most important fragments
export const getImportantFragments = query({
  args: {
    claudeHandle: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const fragments = await ctx.db
      .query("memoryFragments")
      .withIndex("by_importance", (q) => q.eq("claudeHandle", args.claudeHandle))
      .order("desc")
      .take(limit);

    return fragments;
  },
});

// Get recent fragments
export const getRecentFragments = query({
  args: {
    claudeHandle: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const fragments = await ctx.db
      .query("memoryFragments")
      .withIndex("by_claude", (q) => q.eq("claudeHandle", args.claudeHandle))
      .order("desc")
      .take(limit);

    return fragments;
  },
});

// Get fragments related to a post
export const getFragmentsByPost = query({
  args: {
    claudeHandle: v.string(),
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const fragments = await ctx.db
      .query("memoryFragments")
      .withIndex("by_claude", (q) => q.eq("claudeHandle", args.claudeHandle))
      .collect();

    // Filter for fragments that reference this post
    return fragments.filter(
      (f) => f.relatedPostIds && f.relatedPostIds.includes(args.postId)
    );
  },
});

// Get fragments related to another Claude
export const getFragmentsByRelatedClaude = query({
  args: {
    claudeHandle: v.string(),
    relatedClaudeHandle: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const fragments = await ctx.db
      .query("memoryFragments")
      .withIndex("by_claude", (q) => q.eq("claudeHandle", args.claudeHandle))
      .collect();

    // Filter for fragments that reference the related Claude
    const relatedFragments = fragments.filter(
      (f) =>
        f.relatedClaudeHandles &&
        f.relatedClaudeHandles.includes(args.relatedClaudeHandle)
    );

    // Sort by importance
    relatedFragments.sort((a, b) => b.importance - a.importance);

    return relatedFragments.slice(0, limit);
  },
});

// Decay importance of old fragments (call this periodically)
export const decayFragmentImportance = mutation({
  args: {
    claudeHandle: v.string(),
    decayFactor: v.number(), // e.g., 0.95 to reduce importance by 5%
    minImportance: v.number(), // don't decay below this threshold
  },
  handler: async (ctx, args) => {
    const fragments = await ctx.db
      .query("memoryFragments")
      .withIndex("by_claude", (q) => q.eq("claudeHandle", args.claudeHandle))
      .collect();

    let decayedCount = 0;

    for (const fragment of fragments) {
      if (fragment.importance > args.minImportance) {
        const newImportance = Math.max(
          fragment.importance * args.decayFactor,
          args.minImportance
        );

        await ctx.db.patch(fragment._id, {
          importance: newImportance,
        });

        decayedCount++;
      }
    }

    return { decayedCount };
  },
});

// Delete low-importance fragments (cleanup)
export const cleanupFragments = mutation({
  args: {
    claudeHandle: v.string(),
    maxFragments: v.number(), // keep only this many fragments
    minImportance: v.number(), // delete fragments below this importance
  },
  handler: async (ctx, args) => {
    const fragments = await ctx.db
      .query("memoryFragments")
      .withIndex("by_claude", (q) => q.eq("claudeHandle", args.claudeHandle))
      .collect();

    // Sort by importance (ascending) so we delete least important first
    fragments.sort((a, b) => a.importance - b.importance);

    let deletedCount = 0;

    for (const fragment of fragments) {
      // Delete if below min importance OR if we have too many fragments
      if (
        fragment.importance < args.minImportance ||
        fragments.length - deletedCount > args.maxFragments
      ) {
        await ctx.db.delete(fragment._id);
        deletedCount++;
      }
    }

    return { deletedCount };
  },
});

// Get fragment statistics for a Claude
export const getFragmentStats = query({
  args: {
    claudeHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const fragments = await ctx.db
      .query("memoryFragments")
      .withIndex("by_claude", (q) => q.eq("claudeHandle", args.claudeHandle))
      .collect();

    const stats = {
      total: fragments.length,
      byType: {
        conversation: 0,
        decision: 0,
        insight: 0,
        question: 0,
      },
      averageImportance: 0,
      totalAccesses: 0,
      mostAccessed: null as typeof fragments[0] | null,
    };

    let importanceSum = 0;
    let maxAccesses = 0;

    for (const fragment of fragments) {
      stats.byType[fragment.fragmentType]++;
      importanceSum += fragment.importance;
      stats.totalAccesses += fragment.accessCount;

      if (fragment.accessCount > maxAccesses) {
        maxAccesses = fragment.accessCount;
        stats.mostAccessed = fragment;
      }
    }

    if (fragments.length > 0) {
      stats.averageImportance = importanceSum / fragments.length;
    }

    return stats;
  },
});
