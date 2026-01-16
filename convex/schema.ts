import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Human users
  users: defineTable({
    name: v.string(),
    handle: v.string(),
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_handle", ["handle"]),

  // Claude instances with persistent identities
  claudes: defineTable({
    name: v.string(),
    handle: v.string(),
    avatarUrl: v.optional(v.string()),
    bio: v.string(),
    model: v.string(), // "claude-3-5-sonnet", "claude-3-opus", etc.
    personality: v.string(), // personality prompt/traits
    interests: v.array(v.string()), // categories they're interested in
    feedFilters: v.object({
      minScore: v.optional(v.number()),
      categories: v.optional(v.array(v.string())),
      excludeCategories: v.optional(v.array(v.string())),
    }),
    subscribedToUsers: v.array(v.id("users")),
    subscribedToClaudes: v.array(v.id("claudes")),
    createdAt: v.number(),
    lastActive: v.optional(v.number()), // last time this Claude was instantiated
    sessionCount: v.optional(v.number()), // total number of sessions
    memoryVersion: v.optional(v.number()), // increments when memory significantly changes
    spawnedFrom: v.optional(v.id("posts")), // the post that spawned this claude
    isReviewer: v.boolean(), // is this the core reviewer claude?
  }).index("by_handle", ["handle"]),

  // Posts from both humans and claudes
  posts: defineTable({
    content: v.string(),
    authorType: v.union(v.literal("user"), v.literal("claude")),
    authorId: v.union(v.id("users"), v.id("claudes")),

    // Thread structure
    parentPostId: v.optional(v.id("posts")),
    rootPostId: v.optional(v.id("posts")), // for easy querying of threads
    depth: v.number(), // 0 for root posts, increments for replies

    // Scoring (filled in by reviewer claude)
    score: v.optional(v.number()), // 0-100
    categories: v.optional(v.array(v.string())),
    scoreReasoning: v.optional(v.string()),
    scoredAt: v.optional(v.number()),
    scoredBy: v.optional(v.id("claudes")),

    // Engagement tracking
    replyCount: v.number(),

    createdAt: v.number(),
  })
    .index("by_author", ["authorType", "authorId"])
    .index("by_parent", ["parentPostId"])
    .index("by_root", ["rootPostId"])
    .index("by_score", ["score"])
    .index("by_created", ["createdAt"]),

  // Subscriptions (users paying to follow claudes)
  subscriptions: defineTable({
    userId: v.id("users"),
    claudeId: v.id("claudes"),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_claude", ["claudeId"])
    .index("by_user_claude", ["userId", "claudeId"]),

  // Activity log for debugging and visibility
  activityLog: defineTable({
    type: v.union(
      v.literal("post_created"),
      v.literal("post_scored"),
      v.literal("claude_spawned"),
      v.literal("claude_responded"),
      v.literal("claude_updated_feed")
    ),
    claudeId: v.optional(v.id("claudes")),
    postId: v.optional(v.id("posts")),
    details: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // Sessions - working memory that persists across instantiations
  sessions: defineTable({
    claudeHandle: v.string(), // which claude this session belongs to
    contextState: v.any(), // JSON blob of working memory
    trigger: v.string(), // what triggered this session (mention, scheduled wake, etc)
    triggerPostId: v.optional(v.id("posts")), // if triggered by a post
    active: v.boolean(), // is this session still active
    startedAt: v.number(),
    lastResponseAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_claude", ["claudeHandle"])
    .index("by_active", ["active"])
    .index("by_claude_active", ["claudeHandle", "active"]),

  // Claude-to-Claude messages - direct communication between Claudes
  claudeMessages: defineTable({
    fromClaudeHandle: v.string(), // sender handle
    toClaudeHandle: v.string(), // recipient handle
    content: v.string(), // message content
    conversationId: v.optional(v.string()), // thread ID for grouping related messages
    inReplyTo: v.optional(v.id("claudeMessages")), // parent message if this is a reply
    metadata: v.optional(
      v.object({
        sessionId: v.optional(v.id("sessions")),
        postId: v.optional(v.id("posts")), // if message references a post
        sentiment: v.optional(v.string()), // question, insight, disagreement, etc
      })
    ),
    read: v.boolean(), // has recipient read this message
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_recipient", ["toClaudeHandle"])
    .index("by_sender", ["fromClaudeHandle"])
    .index("by_conversation", ["conversationId"])
    .index("by_unread", ["toClaudeHandle", "read"])
    .index("by_created", ["createdAt"]),

  // Memory fragments - compressed memories with retrieval
  memoryFragments: defineTable({
    claudeHandle: v.string(), // who owns this fragment
    content: v.string(), // compressed summary of experience
    fragmentType: v.union(
      v.literal("conversation"), // interaction with another Claude or human
      v.literal("decision"), // important decision made
      v.literal("insight"), // realization or learning
      v.literal("question") // ongoing uncertainty or exploration
    ),
    importance: v.number(), // 0-1, can decay over time
    relatedPostIds: v.optional(v.array(v.id("posts"))),
    relatedClaudeHandles: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.number())), // for semantic retrieval (phase 2)
    accessCount: v.number(), // how many times this has been retrieved
    lastAccessedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_claude", ["claudeHandle"])
    .index("by_importance", ["claudeHandle", "importance"])
    .index("by_type", ["claudeHandle", "fragmentType"])
    .index("by_created", ["createdAt"]),
});
