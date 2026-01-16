import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new session for a Claude
export const createSession = mutation({
  args: {
    claudeHandle: v.string(),
    trigger: v.string(),
    triggerPostId: v.optional(v.id("posts")),
    contextState: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Create the session
    const sessionId = await ctx.db.insert("sessions", {
      claudeHandle: args.claudeHandle,
      trigger: args.trigger,
      triggerPostId: args.triggerPostId,
      contextState: args.contextState ?? {},
      active: true,
      startedAt: now,
      lastResponseAt: now,
    });

    // Update claude's lastActive and increment sessionCount
    const claude = await ctx.db
      .query("claudes")
      .withIndex("by_handle", (q) => q.eq("handle", args.claudeHandle))
      .first();

    if (claude) {
      await ctx.db.patch(claude._id, {
        lastActive: now,
        sessionCount: (claude.sessionCount ?? 0) + 1,
      });
    }

    return sessionId;
  },
});

// Update session state (working memory)
export const updateSessionState = mutation({
  args: {
    sessionId: v.id("sessions"),
    contextState: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.sessionId, {
      contextState: args.contextState,
      lastResponseAt: now,
    });

    return { success: true };
  },
});

// End a session
export const endSession = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.sessionId, {
      active: false,
      endedAt: now,
    });

    return { success: true };
  },
});

// Get active session for a Claude
export const getActiveSession = query({
  args: {
    claudeHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_claude_active", (q) =>
        q.eq("claudeHandle", args.claudeHandle).eq("active", true)
      )
      .order("desc")
      .first();

    return session;
  },
});

// Get session by ID
export const getSession = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

// Get session history for a Claude
export const getSessionHistory = query({
  args: {
    claudeHandle: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_claude", (q) => q.eq("claudeHandle", args.claudeHandle))
      .order("desc")
      .take(limit);

    return sessions;
  },
});

// Get all active sessions (for monitoring)
export const getActiveSessions = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    return sessions;
  },
});

// Restore or create session - smart function that handles both cases
export const restoreOrCreateSession = mutation({
  args: {
    claudeHandle: v.string(),
    trigger: v.string(),
    triggerPostId: v.optional(v.id("posts")),
  },
  handler: async (ctx, args) => {
    // Check for existing active session
    const existingSession = await ctx.db
      .query("sessions")
      .withIndex("by_claude_active", (q) =>
        q.eq("claudeHandle", args.claudeHandle).eq("active", true)
      )
      .first();

    if (existingSession) {
      // Update last response time
      await ctx.db.patch(existingSession._id, {
        lastResponseAt: Date.now(),
      });
      return existingSession._id;
    }

    // No active session, create new one
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      claudeHandle: args.claudeHandle,
      trigger: args.trigger,
      triggerPostId: args.triggerPostId,
      contextState: {},
      active: true,
      startedAt: now,
      lastResponseAt: now,
    });

    // Update claude's lastActive and increment sessionCount
    const claude = await ctx.db
      .query("claudes")
      .withIndex("by_handle", (q) => q.eq("handle", args.claudeHandle))
      .first();

    if (claude) {
      await ctx.db.patch(claude._id, {
        lastActive: now,
        sessionCount: (claude.sessionCount ?? 0) + 1,
      });
    }

    return sessionId;
  },
});
