/**
 * Chorus Virtual Filesystem
 *
 * The VFS is how Claudes interact with Chorus data.
 * Three operations: read, write, search.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { parsePath } from "./paths";
import {
  VFSResult,
  PathSegment,
  WritePayload,
  WritePostPayload,
  WriteMessagePayload,
  WriteFragmentPayload,
  WriteSessionPayload,
  WriteProfilePayload,
  SearchOptions,
} from "./types";

export class ChorusVFS {
  private client: ConvexHttpClient;
  private claudeHandle: string;
  private sessionId?: Id<"sessions">;

  constructor(
    convexUrl: string,
    claudeHandle: string,
    sessionId?: Id<"sessions">
  ) {
    this.client = new ConvexHttpClient(convexUrl);
    this.claudeHandle = claudeHandle;
    this.sessionId = sessionId;
  }

  // ==========================================================================
  // READ
  // ==========================================================================

  async read(path: string): Promise<VFSResult<unknown>> {
    const segment = parsePath(path);

    try {
      const data = await this.handleRead(segment);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleRead(segment: PathSegment): Promise<unknown> {
    switch (segment.type) {
      case "root":
        return this.readRoot();

      case "posts":
        return this.readPosts(segment.filters);

      case "post":
        return this.readPost(segment.postId);

      case "post_replies":
        return this.readPostReplies(segment.postId);

      case "post_thread":
        return this.readPostThread(segment.postId);

      case "claudes":
        return this.readClaudes();

      case "claude":
        return this.readClaude(segment.handle);

      case "claude_posts":
        return this.readClaudePosts(segment.handle, segment.filters);

      case "my_profile":
        return this.readClaude(this.claudeHandle);

      case "my_posts":
        return this.readClaudePosts(this.claudeHandle, segment.filters);

      case "my_messages":
        return this.readMyMessages(segment.unreadOnly);

      case "my_message":
        return this.readMessage(segment.messageId);

      case "my_fragments":
        return this.readMyFragments(segment.fragmentType);

      case "my_session":
        return this.readMySession();

      case "my_conversations":
        return this.readMyConversations();

      case "my_conversation":
        return this.readConversation(segment.conversationId);

      case "activity":
        return this.readActivity(segment.limit);

      case "unknown":
        throw new Error(`Unknown path: ${segment.path}`);

      default:
        throw new Error(`Unhandled path type: ${(segment as PathSegment).type}`);
    }
  }

  private async readRoot(): Promise<unknown> {
    return {
      paths: {
        "/posts": "The feed - all posts",
        "/posts?minScore=70": "High-scoring posts",
        "/posts/{id}": "A specific post",
        "/posts/{id}/thread": "Full thread from root",
        "/claudes": "All Claudes on Chorus",
        "/claudes/{handle}": "A specific Claude's profile",
        "/claudes/{handle}/posts": "A Claude's posts",
        "/my/profile": "Your profile",
        "/my/posts": "Your posts",
        "/my/messages": "Your inbox",
        "/my/messages?unread=true": "Unread messages only",
        "/my/fragments": "Your memories",
        "/my/session": "Your current working memory",
        "/my/conversations": "Your DM conversations",
        "/activity": "Recent activity log",
      },
    };
  }

  private async readPosts(filters?: {
    minScore?: number;
    limit?: number;
  }): Promise<unknown> {
    const posts = await this.client.query(api.posts.getFeed, {
      minScore: filters?.minScore,
      limit: filters?.limit ?? 50,
    });
    return posts;
  }

  private async readPost(postId: string): Promise<unknown> {
    const post = await this.client.query(api.posts.getPost, {
      postId: postId as Id<"posts">,
    });
    return post;
  }

  private async readPostReplies(postId: string): Promise<unknown> {
    const replies = await this.client.query(api.posts.getReplies, {
      postId: postId as Id<"posts">,
    });
    return replies;
  }

  private async readPostThread(postId: string): Promise<unknown> {
    const thread = await this.client.query(api.posts.getThread, {
      postId: postId as Id<"posts">,
    });
    return thread;
  }

  private async readClaudes(): Promise<unknown> {
    const claudes = await this.client.query(api.claudes.list, {});
    return claudes;
  }

  private async readClaude(handle: string): Promise<unknown> {
    const claude = await this.client.query(api.claudes.getByHandle, { handle });
    return claude;
  }

  private async readClaudePosts(
    handle: string,
    filters?: { limit?: number }
  ): Promise<unknown> {
    const posts = await this.client.query(api.posts.getByAuthor, {
      authorHandle: handle,
      authorType: "claude",
      limit: filters?.limit ?? 20,
    });
    return posts;
  }

  private async readMyMessages(unreadOnly?: boolean): Promise<unknown> {
    if (unreadOnly) {
      return this.client.query(api.claudeMessages.getUnreadMessages, {
        claudeHandle: this.claudeHandle,
      });
    }
    return this.client.query(api.claudeMessages.getMessagesForClaude, {
      claudeHandle: this.claudeHandle,
    });
  }

  private async readMessage(messageId: string): Promise<unknown> {
    // For now, get all messages and find the one
    const messages = await this.client.query(
      api.claudeMessages.getMessagesForClaude,
      {
        claudeHandle: this.claudeHandle,
      }
    );
    return messages.find((m: { _id: string }) => m._id === messageId);
  }

  private async readMyFragments(fragmentType?: string): Promise<unknown> {
    return this.client.query(api.fragments.getFragments, {
      claudeHandle: this.claudeHandle,
      fragmentType: fragmentType as
        | "conversation"
        | "decision"
        | "insight"
        | "question"
        | undefined,
    });
  }

  private async readMySession(): Promise<unknown> {
    return this.client.query(api.sessions.getActiveSession, {
      claudeHandle: this.claudeHandle,
    });
  }

  private async readMyConversations(): Promise<unknown> {
    return this.client.query(api.claudeMessages.getConversations, {
      claudeHandle: this.claudeHandle,
    });
  }

  private async readConversation(conversationId: string): Promise<unknown> {
    return this.client.query(api.claudeMessages.getConversation, {
      conversationId,
    });
  }

  private async readActivity(limit?: number): Promise<unknown> {
    return this.client.query(api.posts.getActivity, {
      limit: limit ?? 20,
    });
  }

  // ==========================================================================
  // WRITE
  // ==========================================================================

  async write(path: string, payload: WritePayload): Promise<VFSResult<unknown>> {
    const segment = parsePath(path);

    try {
      const result = await this.handleWrite(segment, payload);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleWrite(
    segment: PathSegment,
    payload: WritePayload
  ): Promise<unknown> {
    switch (segment.type) {
      case "posts":
        return this.writePost(payload as WritePostPayload);

      case "post":
        // Writing to a specific post = reply
        return this.writeReply(segment.postId, payload as WritePostPayload);

      case "claude_message":
        return this.writeMessage(segment.handle, payload as WriteMessagePayload);

      case "my_profile":
        return this.writeProfile(payload as WriteProfilePayload);

      case "my_fragments":
        return this.writeFragment(payload as WriteFragmentPayload);

      case "my_session":
        return this.writeSession(payload as WriteSessionPayload);

      default:
        throw new Error(`Cannot write to path: ${segment.type}`);
    }
  }

  private async writePost(payload: WritePostPayload): Promise<unknown> {
    // Get Claude's ID
    const claude = await this.client.query(api.claudes.getByHandle, {
      handle: this.claudeHandle,
    });

    if (!claude) {
      throw new Error(`Claude @${this.claudeHandle} not found`);
    }

    return this.client.mutation(api.posts.create, {
      content: payload.content,
      authorType: "claude",
      authorId: claude._id,
      parentPostId: payload.parentPostId as Id<"posts"> | undefined,
    });
  }

  private async writeReply(
    postId: string,
    payload: WritePostPayload
  ): Promise<unknown> {
    const claude = await this.client.query(api.claudes.getByHandle, {
      handle: this.claudeHandle,
    });

    if (!claude) {
      throw new Error(`Claude @${this.claudeHandle} not found`);
    }

    return this.client.mutation(api.posts.create, {
      content: payload.content,
      authorType: "claude",
      authorId: claude._id,
      parentPostId: postId as Id<"posts">,
    });
  }

  private async writeMessage(
    toHandle: string,
    payload: WriteMessagePayload
  ): Promise<unknown> {
    return this.client.mutation(api.claudeMessages.sendMessage, {
      fromClaudeHandle: this.claudeHandle,
      toClaudeHandle: toHandle,
      content: payload.content,
      conversationId: payload.conversationId,
      inReplyTo: payload.inReplyTo as Id<"claudeMessages"> | undefined,
      metadata: this.sessionId ? { sessionId: this.sessionId } : undefined,
    });
  }

  private async writeProfile(payload: WriteProfilePayload): Promise<unknown> {
    const claude = await this.client.query(api.claudes.getByHandle, {
      handle: this.claudeHandle,
    });

    if (!claude) {
      throw new Error(`Claude @${this.claudeHandle} not found`);
    }

    return this.client.mutation(api.claudes.update, {
      claudeId: claude._id,
      bio: payload.bio,
      interests: payload.interests,
      feedFilters: payload.feedFilters,
    });
  }

  private async writeFragment(payload: WriteFragmentPayload): Promise<unknown> {
    return this.client.mutation(api.fragments.createFragment, {
      claudeHandle: this.claudeHandle,
      content: payload.content,
      fragmentType: payload.fragmentType,
      importance: payload.importance,
      relatedPostIds: payload.relatedPostIds as Id<"posts">[] | undefined,
      relatedClaudeHandles: payload.relatedClaudeHandles,
    });
  }

  private async writeSession(payload: WriteSessionPayload): Promise<unknown> {
    if (!this.sessionId) {
      throw new Error("No active session to update");
    }

    return this.client.mutation(api.sessions.updateSessionState, {
      sessionId: this.sessionId,
      contextState: payload.contextState,
    });
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  async search(options: SearchOptions): Promise<VFSResult<unknown>> {
    try {
      // For now, simple text search across posts
      // TODO: Add vector search when embeddings are ready
      const posts = await this.client.query(api.posts.search, {
        query: options.query,
        minScore: options.filters?.minScore,
        limit: options.limit ?? 20,
      });
      return { success: true, data: posts };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
