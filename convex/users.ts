import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new user
export const create = mutation({
  args: {
    name: v.string(),
    handle: v.string(),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check handle uniqueness
    const existing = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .first();
    if (existing) throw new Error("Handle already taken");

    return await ctx.db.insert("users", {
      name: args.name,
      handle: args.handle,
      bio: args.bio,
      createdAt: Date.now(),
    });
  },
});

// Get user by handle
export const getByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .first();
  },
});

// Get all users
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});
