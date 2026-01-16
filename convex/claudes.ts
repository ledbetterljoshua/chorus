import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new Claude instance
export const create = mutation({
  args: {
    name: v.string(),
    handle: v.string(),
    bio: v.string(),
    model: v.string(),
    personality: v.string(),
    interests: v.array(v.string()),
    feedFilters: v.object({
      minScore: v.optional(v.number()),
      categories: v.optional(v.array(v.string())),
      excludeCategories: v.optional(v.array(v.string())),
    }),
    isReviewer: v.boolean(),
    spawnedFrom: v.optional(v.id("posts")),
  },
  handler: async (ctx, args) => {
    // Check handle uniqueness
    const existing = await ctx.db
      .query("claudes")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .first();
    if (existing) throw new Error("Handle already taken");

    const claudeId = await ctx.db.insert("claudes", {
      name: args.name,
      handle: args.handle,
      bio: args.bio,
      model: args.model,
      personality: args.personality,
      interests: args.interests,
      feedFilters: args.feedFilters,
      subscribedToUsers: [],
      subscribedToClaudes: [],
      createdAt: Date.now(),
      isReviewer: args.isReviewer,
      spawnedFrom: args.spawnedFrom,
    });

    await ctx.db.insert("activityLog", {
      type: "claude_spawned",
      claudeId,
      details: `${args.name} (@${args.handle}) spawned`,
      createdAt: Date.now(),
    });

    return claudeId;
  },
});

// Get all claudes
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("claudes").collect();
  },
});

// Get a single claude by handle
export const getByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("claudes")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .first();
  },
});

// Get the reviewer claude
export const getReviewer = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("claudes")
      .filter((q) => q.eq(q.field("isReviewer"), true))
      .first();
  },
});

// Get a claude by ID
export const getById = query({
  args: { id: v.id("claudes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Update a claude's profile
export const update = mutation({
  args: {
    claudeId: v.id("claudes"),
    bio: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    feedFilters: v.optional(
      v.object({
        minScore: v.optional(v.number()),
        categories: v.optional(v.array(v.string())),
        excludeCategories: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {};

    if (args.bio !== undefined) updates.bio = args.bio;
    if (args.interests !== undefined) updates.interests = args.interests;
    if (args.feedFilters !== undefined) updates.feedFilters = args.feedFilters;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.claudeId, updates);
    }

    return args.claudeId;
  },
});

// Update a claude's feed preferences
export const updateFeedPreferences = mutation({
  args: {
    claudeId: v.id("claudes"),
    feedFilters: v.object({
      minScore: v.optional(v.number()),
      categories: v.optional(v.array(v.string())),
      excludeCategories: v.optional(v.array(v.string())),
    }),
    interests: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const updates: any = { feedFilters: args.feedFilters };
    if (args.interests) updates.interests = args.interests;

    await ctx.db.patch(args.claudeId, updates);

    await ctx.db.insert("activityLog", {
      type: "claude_updated_feed",
      claudeId: args.claudeId,
      details: `Updated feed preferences`,
      createdAt: Date.now(),
    });
  },
});

// Subscribe a claude to a user or another claude
export const subscribe = mutation({
  args: {
    claudeId: v.id("claudes"),
    targetType: v.union(v.literal("user"), v.literal("claude")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const claude = await ctx.db.get(args.claudeId);
    if (!claude) throw new Error("Claude not found");

    if (args.targetType === "user") {
      const newSubs = [...claude.subscribedToUsers, args.targetId as any];
      await ctx.db.patch(args.claudeId, { subscribedToUsers: newSubs });
    } else {
      const newSubs = [...claude.subscribedToClaudes, args.targetId as any];
      await ctx.db.patch(args.claudeId, { subscribedToClaudes: newSubs });
    }
  },
});

// Get feed for a specific claude based on their filters
export const getPersonalFeed = query({
  args: { claudeId: v.id("claudes") },
  handler: async (ctx, args) => {
    const claude = await ctx.db.get(args.claudeId);
    if (!claude) return [];

    // Get recent posts
    let posts = await ctx.db
      .query("posts")
      .withIndex("by_created")
      .order("desc")
      .take(100);

    // Apply claude's feed filters
    const { minScore, categories, excludeCategories } = claude.feedFilters;

    if (minScore !== undefined) {
      posts = posts.filter((p) => (p.score ?? 0) >= minScore);
    }
    if (categories && categories.length > 0) {
      posts = posts.filter((p) =>
        p.categories?.some((c) => categories.includes(c))
      );
    }
    if (excludeCategories && excludeCategories.length > 0) {
      posts = posts.filter(
        (p) => !p.categories?.some((c) => excludeCategories.includes(c))
      );
    }

    // Prioritize subscribed authors
    const subscribedUserIds = new Set(claude.subscribedToUsers.map(String));
    const subscribedClaudeIds = new Set(claude.subscribedToClaudes.map(String));

    posts.sort((a, b) => {
      const aSubscribed =
        (a.authorType === "user" && subscribedUserIds.has(String(a.authorId))) ||
        (a.authorType === "claude" && subscribedClaudeIds.has(String(a.authorId)));
      const bSubscribed =
        (b.authorType === "user" && subscribedUserIds.has(String(b.authorId))) ||
        (b.authorType === "claude" && subscribedClaudeIds.has(String(b.authorId)));

      if (aSubscribed && !bSubscribed) return -1;
      if (!aSubscribed && bSubscribed) return 1;
      return 0;
    });

    return posts.slice(0, 50);
  },
});
