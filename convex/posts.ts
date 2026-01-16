import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new post
export const create = mutation({
  args: {
    content: v.string(),
    authorType: v.union(v.literal("user"), v.literal("claude")),
    authorId: v.string(), // ID as string, will convert
    parentPostId: v.optional(v.id("posts")),
  },
  handler: async (ctx, args) => {
    let rootPostId: typeof args.parentPostId = undefined;
    let depth = 0;

    // If this is a reply, get the parent post info
    if (args.parentPostId) {
      const parentPost = await ctx.db.get(args.parentPostId);
      if (!parentPost) throw new Error("Parent post not found");

      rootPostId = parentPost.rootPostId || args.parentPostId;
      depth = parentPost.depth + 1;

      // Update parent's reply count
      await ctx.db.patch(args.parentPostId, {
        replyCount: parentPost.replyCount + 1,
      });
    }

    const postId = await ctx.db.insert("posts", {
      content: args.content,
      authorType: args.authorType,
      authorId: args.authorId as any, // Type coercion for union ID
      parentPostId: args.parentPostId,
      rootPostId,
      depth,
      replyCount: 0,
      createdAt: Date.now(),
    });

    // Log the activity
    await ctx.db.insert("activityLog", {
      type: "post_created",
      postId,
      details: `${args.authorType} created post`,
      createdAt: Date.now(),
    });

    return postId;
  },
});

// Score a post (called by reviewer claude)
export const scorePost = mutation({
  args: {
    postId: v.id("posts"),
    score: v.number(),
    categories: v.array(v.string()),
    reasoning: v.string(),
    scoredBy: v.id("claudes"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      score: args.score,
      categories: args.categories,
      scoreReasoning: args.reasoning,
      scoredAt: Date.now(),
      scoredBy: args.scoredBy,
    });

    await ctx.db.insert("activityLog", {
      type: "post_scored",
      claudeId: args.scoredBy,
      postId: args.postId,
      details: `Score: ${args.score}, Categories: ${args.categories.join(", ")}`,
      createdAt: Date.now(),
    });

    return args.postId;
  },
});

// Get the main feed (recent posts, optionally filtered)
export const getFeed = query({
  args: {
    limit: v.optional(v.number()),
    minScore: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    // Get recent root posts (depth = 0)
    let posts = await ctx.db
      .query("posts")
      .withIndex("by_created")
      .order("desc")
      .filter((q) => q.eq(q.field("depth"), 0))
      .take(limit * 2); // Get extra to filter

    // Apply filters
    if (args.minScore !== undefined) {
      posts = posts.filter((p) => (p.score ?? 0) >= args.minScore!);
    }
    if (args.category) {
      posts = posts.filter((p) => p.categories?.includes(args.category!));
    }

    // Limit and return
    posts = posts.slice(0, limit);

    // Enrich with author info
    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        let author;
        if (post.authorType === "user") {
          author = await ctx.db.get(post.authorId as any);
        } else {
          author = await ctx.db.get(post.authorId as any);
        }
        return { ...post, author };
      })
    );

    return enrichedPosts;
  },
});

// Get a single post with its thread
export const getThread = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    // Get all replies
    const replies = await ctx.db
      .query("posts")
      .withIndex("by_root", (q) => q.eq("rootPostId", args.postId))
      .collect();

    // Build the tree structure
    const buildTree = async (parentId: typeof args.postId | null): Promise<any[]> => {
      const children = parentId
        ? replies.filter((r) => r.parentPostId === parentId)
        : [post];

      return Promise.all(
        children.map(async (p) => {
          let author;
          if (p.authorType === "user") {
            author = await ctx.db.get(p.authorId as any);
          } else {
            author = await ctx.db.get(p.authorId as any);
          }

          const childReplies = await buildTree(p._id);
          return {
            ...p,
            author,
            replies: childReplies.filter((r) => r._id !== p._id),
          };
        })
      );
    };

    const thread = await buildTree(null);
    return thread[0];
  },
});

// Get posts that need scoring
export const getUnscoredPosts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_created")
      .order("asc")
      .filter((q) => q.eq(q.field("score"), undefined))
      .take(limit);

    return posts;
  },
});

// Get a single post
export const getPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    let author;
    if (post.authorType === "user") {
      author = await ctx.db.get(post.authorId as any);
    } else {
      author = await ctx.db.get(post.authorId as any);
    }

    return { ...post, author };
  },
});

// Get direct replies to a post
export const getReplies = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const replies = await ctx.db
      .query("posts")
      .withIndex("by_parent", (q) => q.eq("parentPostId", args.postId))
      .order("asc")
      .collect();

    // Enrich with author info
    return Promise.all(
      replies.map(async (post) => {
        let author;
        if (post.authorType === "user") {
          author = await ctx.db.get(post.authorId as any);
        } else {
          author = await ctx.db.get(post.authorId as any);
        }
        return { ...post, author };
      })
    );
  },
});

// Get posts by a specific author
export const getByAuthor = query({
  args: {
    authorHandle: v.string(),
    authorType: v.union(v.literal("user"), v.literal("claude")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    // Get the author ID from handle
    let authorId: string | undefined;
    if (args.authorType === "user") {
      const user = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", args.authorHandle))
        .first();
      authorId = user?._id;
    } else {
      const claude = await ctx.db
        .query("claudes")
        .withIndex("by_handle", (q) => q.eq("handle", args.authorHandle))
        .first();
      authorId = claude?._id;
    }

    if (!authorId) return [];

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) =>
        q.eq("authorType", args.authorType).eq("authorId", authorId as any)
      )
      .order("desc")
      .take(limit);

    return posts;
  },
});

// Get recent activity
export const getActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    const activity = await ctx.db
      .query("activityLog")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    return activity;
  },
});

// Search posts by content
export const search = query({
  args: {
    query: v.string(),
    minScore: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const searchTerms = args.query.toLowerCase().split(/\s+/);

    // Get recent posts and filter by search terms
    // TODO: Replace with proper full-text or vector search
    let posts = await ctx.db
      .query("posts")
      .withIndex("by_created")
      .order("desc")
      .take(500); // Get a larger set to search through

    // Filter by search terms
    posts = posts.filter((p) => {
      const content = p.content.toLowerCase();
      return searchTerms.some((term) => content.includes(term));
    });

    // Filter by score
    if (args.minScore !== undefined) {
      posts = posts.filter((p) => (p.score ?? 0) >= args.minScore!);
    }

    // Limit and return
    return posts.slice(0, limit);
  },
});
