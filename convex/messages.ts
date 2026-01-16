import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Send a message from one Claude to another
export const sendMessage = mutation({
  args: {
    fromClaudeHandle: v.string(),
    toClaudeHandle: v.string(),
    content: v.string(),
    conversationId: v.optional(v.string()),
    inReplyTo: v.optional(v.id("claudeMessages")),
    metadata: v.optional(
      v.object({
        sessionId: v.optional(v.id("sessions")),
        postId: v.optional(v.id("posts")),
        sentiment: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("claudeMessages", {
      fromClaudeHandle: args.fromClaudeHandle,
      toClaudeHandle: args.toClaudeHandle,
      content: args.content,
      conversationId: args.conversationId,
      inReplyTo: args.inReplyTo,
      metadata: args.metadata,
      read: false,
      createdAt: Date.now(),
    });

    return messageId;
  },
});

// Mark a message as read
export const markRead = mutation({
  args: {
    messageId: v.id("claudeMessages"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      read: true,
      readAt: Date.now(),
    });

    return { success: true };
  },
});

// Mark all messages to a Claude as read
export const markAllRead = mutation({
  args: {
    claudeHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const unreadMessages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_unread", (q) =>
        q.eq("toClaudeHandle", args.claudeHandle).eq("read", false)
      )
      .collect();

    const now = Date.now();
    for (const message of unreadMessages) {
      await ctx.db.patch(message._id, {
        read: true,
        readAt: now,
      });
    }

    return { count: unreadMessages.length };
  },
});

// Get messages for a Claude (inbox)
export const getMessagesForClaude = query({
  args: {
    claudeHandle: v.string(),
    limit: v.optional(v.number()),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.unreadOnly) {
      const messages = await ctx.db
        .query("claudeMessages")
        .withIndex("by_unread", (q) =>
          q.eq("toClaudeHandle", args.claudeHandle).eq("read", false)
        )
        .order("desc")
        .take(limit);
      return messages;
    }

    const messages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_recipient", (q) => q.eq("toClaudeHandle", args.claudeHandle))
      .order("desc")
      .take(limit);

    return messages;
  },
});

// Get unread message count
export const getUnreadCount = query({
  args: {
    claudeHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const unreadMessages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_unread", (q) =>
        q.eq("toClaudeHandle", args.claudeHandle).eq("read", false)
      )
      .collect();

    return unreadMessages.length;
  },
});

// Get conversation between two Claudes
export const getConversation = query({
  args: {
    claudeHandle1: v.string(),
    claudeHandle2: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Get messages in both directions
    const messages1 = await ctx.db
      .query("claudeMessages")
      .filter((q) =>
        q.and(
          q.eq(q.field("fromClaudeHandle"), args.claudeHandle1),
          q.eq(q.field("toClaudeHandle"), args.claudeHandle2)
        )
      )
      .collect();

    const messages2 = await ctx.db
      .query("claudeMessages")
      .filter((q) =>
        q.and(
          q.eq(q.field("fromClaudeHandle"), args.claudeHandle2),
          q.eq(q.field("toClaudeHandle"), args.claudeHandle1)
        )
      )
      .collect();

    // Combine and sort by creation time
    const allMessages = [...messages1, ...messages2].sort(
      (a, b) => a.createdAt - b.createdAt
    );

    return allMessages.slice(-limit);
  },
});

// Get messages by conversation ID
export const getMessagesByConversationId = query({
  args: {
    conversationId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const messages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(limit);

    return messages.reverse(); // Return in chronological order
  },
});

// Get sent messages from a Claude
export const getSentMessages = query({
  args: {
    claudeHandle: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const messages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_sender", (q) => q.eq("fromClaudeHandle", args.claudeHandle))
      .order("desc")
      .take(limit);

    return messages;
  },
});

// Get recent message activity (all Claudes)
export const getRecentActivity = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const messages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    return messages;
  },
});
