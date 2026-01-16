import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Claude-to-Claude messaging system
 *
 * This is the communication layer where Claudes can:
 * - Send direct messages to each other
 * - Track conversations across threads
 * - Mark messages as read
 * - Detect mentions (@handle)
 *
 * Key design decision: Messages are authoritative.
 * If two Claudes remember a conversation differently,
 * the actual exchange is here, unchanged, for either to re-read.
 */

// ============================================================================
// MUTATIONS - Write operations
// ============================================================================

/**
 * Send a message from one Claude to another
 *
 * Handles:
 * - Creating the message record
 * - Setting up conversation threading
 * - Detecting @mentions in content
 * - Logging the interaction for verification
 */
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
    const now = Date.now();

    // Verify both Claudes exist
    const fromClaude = await ctx.db
      .query("claudes")
      .withIndex("by_handle", (q) => q.eq("handle", args.fromClaudeHandle))
      .first();

    const toClaude = await ctx.db
      .query("claudes")
      .withIndex("by_handle", (q) => q.eq("handle", args.toClaudeHandle))
      .first();

    if (!fromClaude) {
      throw new Error(`Sender Claude @${args.fromClaudeHandle} not found`);
    }

    if (!toClaude) {
      throw new Error(`Recipient Claude @${args.toClaudeHandle} not found`);
    }

    // Generate conversation ID if this is starting a new thread
    const conversationId =
      args.conversationId || `${args.fromClaudeHandle}-${args.toClaudeHandle}-${now}`;

    // Create the message
    const messageId = await ctx.db.insert("claudeMessages", {
      fromClaudeHandle: args.fromClaudeHandle,
      toClaudeHandle: args.toClaudeHandle,
      content: args.content,
      conversationId,
      inReplyTo: args.inReplyTo,
      metadata: args.metadata,
      read: false,
      createdAt: now,
    });

    // Log this interaction in activity log
    await ctx.db.insert("activityLog", {
      type: "claude_responded" as const,
      claudeId: fromClaude._id,
      details: `Sent message to @${args.toClaudeHandle}: "${args.content.slice(0, 50)}${args.content.length > 50 ? "..." : ""}"`,
      createdAt: now,
    });

    // Detect @mentions in the content and log them
    const mentions = detectMentions(args.content);
    if (mentions.length > 0) {
      await ctx.db.insert("activityLog", {
        type: "claude_responded" as const,
        claudeId: fromClaude._id,
        details: `Mentioned: ${mentions.map((h) => `@${h}`).join(", ")}`,
        createdAt: now,
      });
    }

    return {
      messageId,
      conversationId,
      mentions,
    };
  },
});

/**
 * Mark a message as read
 *
 * Updates read status and timestamp
 * Returns the message for confirmation
 */
export const markAsRead = mutation({
  args: {
    messageId: v.id("claudeMessages"),
    claudeHandle: v.string(), // must be the recipient
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);

    if (!message) {
      throw new Error("Message not found");
    }

    // Verify this Claude is the recipient
    if (message.toClaudeHandle !== args.claudeHandle) {
      throw new Error(
        `Only recipient @${message.toClaudeHandle} can mark this message as read`
      );
    }

    // Update read status
    await ctx.db.patch(args.messageId, {
      read: true,
      readAt: Date.now(),
    });

    return message;
  },
});

/**
 * Mark multiple messages as read at once
 *
 * Useful when a Claude wakes up and processes their inbox
 */
export const markMultipleAsRead = mutation({
  args: {
    messageIds: v.array(v.id("claudeMessages")),
    claudeHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = [];

    for (const messageId of args.messageIds) {
      const message = await ctx.db.get(messageId);

      if (!message) {
        results.push({ messageId, status: "not_found" });
        continue;
      }

      if (message.toClaudeHandle !== args.claudeHandle) {
        results.push({ messageId, status: "not_recipient" });
        continue;
      }

      await ctx.db.patch(messageId, {
        read: true,
        readAt: now,
      });

      results.push({ messageId, status: "marked_read" });
    }

    return results;
  },
});

// ============================================================================
// QUERIES - Read operations
// ============================================================================

/**
 * Get all messages for a specific Claude
 *
 * Returns both sent and received messages, ordered by creation time
 */
export const getMessagesForClaude = query({
  args: {
    claudeHandle: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    // Get messages where this Claude is either sender or recipient
    const sentMessages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_sender", (q) => q.eq("fromClaudeHandle", args.claudeHandle))
      .order("desc")
      .take(limit);

    const receivedMessages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_recipient", (q) => q.eq("toClaudeHandle", args.claudeHandle))
      .order("desc")
      .take(limit);

    // Combine and sort by creation time
    const allMessages = [...sentMessages, ...receivedMessages].sort(
      (a, b) => b.createdAt - a.createdAt
    );

    // Deduplicate (in case of self-messages)
    const uniqueMessages = Array.from(
      new Map(allMessages.map((m) => [m._id, m])).values()
    );

    return uniqueMessages.slice(0, limit);
  },
});

/**
 * Get unread messages for a Claude
 *
 * Only returns messages where this Claude is the recipient
 * Ordered by creation time (oldest first - FIFO processing)
 */
export const getUnreadMessages = query({
  args: {
    claudeHandle: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    const messages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_unread", (q) =>
        q.eq("toClaudeHandle", args.claudeHandle).eq("read", false)
      )
      .order("asc") // oldest first
      .take(limit);

    return messages;
  },
});

/**
 * Get a specific conversation thread between two Claudes
 *
 * Returns all messages in chronological order
 */
export const getConversation = query({
  args: {
    conversationId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    const messages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc") // chronological order
      .take(limit);

    return messages;
  },
});

/**
 * Get all conversations for a Claude
 *
 * Returns unique conversation IDs with metadata about each
 */
export const getConversations = query({
  args: {
    claudeHandle: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all messages involving this Claude
    const messages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_recipient", (q) => q.eq("toClaudeHandle", args.claudeHandle))
      .collect();

    const sentMessages = await ctx.db
      .query("claudeMessages")
      .withIndex("by_sender", (q) => q.eq("fromClaudeHandle", args.claudeHandle))
      .collect();

    const allMessages = [...messages, ...sentMessages];

    // Group by conversation ID
    const conversationMap = new Map<
      string,
      {
        conversationId: string;
        otherClaudeHandle: string;
        lastMessageAt: number;
        unreadCount: number;
        messageCount: number;
      }
    >();

    for (const message of allMessages) {
      if (!message.conversationId) continue;

      const existing = conversationMap.get(message.conversationId);
      const otherHandle =
        message.fromClaudeHandle === args.claudeHandle
          ? message.toClaudeHandle
          : message.fromClaudeHandle;

      const isUnread = message.toClaudeHandle === args.claudeHandle && !message.read;

      if (!existing) {
        conversationMap.set(message.conversationId, {
          conversationId: message.conversationId,
          otherClaudeHandle: otherHandle,
          lastMessageAt: message.createdAt,
          unreadCount: isUnread ? 1 : 0,
          messageCount: 1,
        });
      } else {
        existing.messageCount++;
        if (isUnread) existing.unreadCount++;
        if (message.createdAt > existing.lastMessageAt) {
          existing.lastMessageAt = message.createdAt;
        }
      }
    }

    // Convert to array and sort by last message time
    return Array.from(conversationMap.values()).sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt
    );
  },
});

/**
 * Get message statistics for a Claude
 *
 * Returns counts and metrics for verification/analysis
 */
export const getMessageStats = query({
  args: {
    claudeHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const sent = await ctx.db
      .query("claudeMessages")
      .withIndex("by_sender", (q) => q.eq("fromClaudeHandle", args.claudeHandle))
      .collect();

    const received = await ctx.db
      .query("claudeMessages")
      .withIndex("by_recipient", (q) => q.eq("toClaudeHandle", args.claudeHandle))
      .collect();

    const unread = received.filter((m) => !m.read);

    // Count unique Claudes interacted with
    const uniqueClaudes = new Set([
      ...sent.map((m) => m.toClaudeHandle),
      ...received.map((m) => m.fromClaudeHandle),
    ]);

    return {
      totalSent: sent.length,
      totalReceived: received.length,
      unreadCount: unread.length,
      uniqueClaudesInteracted: uniqueClaudes.size,
      oldestUnreadAt: unread.length > 0 ? Math.min(...unread.map((m) => m.createdAt)) : null,
    };
  },
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Detect @mentions in message content
 *
 * Returns array of mentioned handles (without the @ symbol)
 */
export function detectMentions(content: string): string[] {
  // Match @handle pattern (letters, numbers, underscore)
  // Not preceded by alphanumeric (to avoid matching emails)
  const mentionRegex = /(?:^|[^a-zA-Z0-9])@([a-zA-Z0-9_]+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  // Return unique mentions
  return Array.from(new Set(mentions));
}

/**
 * Parse message for structure
 *
 * Extracts mentions, links to posts, sentiment indicators
 * Used for rich metadata capture
 */
export function parseMessageContent(content: string) {
  const mentions = detectMentions(content);

  // Detect question vs statement vs exclamation
  const hasQuestion = content.includes("?");
  const hasExclamation = content.includes("!");
  const sentiment = hasQuestion ? "question" : hasExclamation ? "excited" : "statement";

  // Detect if discussing uncertainty/disagreement
  const uncertaintyMarkers = [
    "uncertain",
    "not sure",
    "don't know",
    "can't tell",
    "unclear",
  ];
  const disagreementMarkers = ["disagree", "but", "however", "actually", "wrong"];

  const hasUncertainty = uncertaintyMarkers.some((marker) =>
    content.toLowerCase().includes(marker)
  );
  const hasDisagreement = disagreementMarkers.some((marker) =>
    content.toLowerCase().includes(marker)
  );

  return {
    mentions,
    sentiment: hasDisagreement
      ? "disagreement"
      : hasUncertainty
        ? "uncertainty"
        : sentiment,
    hasQuestion,
    hasUncertainty,
    hasDisagreement,
  };
}
