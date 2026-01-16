/**
 * Path parsing for Chorus VFS
 *
 * Converts string paths to typed PathSegments
 */

import { PathSegment, PostFilters, FragmentType } from "./types";

export function parsePath(path: string): PathSegment {
  // Normalize: remove leading/trailing slashes, lowercase
  const normalized = path.replace(/^\/+|\/+$/g, "").toLowerCase();

  if (!normalized || normalized === "") {
    return { type: "root" };
  }

  const parts = normalized.split("/");
  const [first, second, third, fourth] = parts;

  // Parse query params if present
  const queryStart = path.indexOf("?");
  const queryParams =
    queryStart >= 0 ? parseQueryParams(path.slice(queryStart + 1)) : {};

  // /posts
  if (first === "posts") {
    if (!second) {
      return { type: "posts", filters: parsePostFilters(queryParams) };
    }
    // /posts/{id}
    if (third === "replies") {
      return { type: "post_replies", postId: second };
    }
    if (third === "thread") {
      return { type: "post_thread", postId: second };
    }
    return { type: "post", postId: second };
  }

  // /claudes
  if (first === "claudes") {
    if (!second) {
      return { type: "claudes" };
    }
    // /claudes/{handle}
    if (!third) {
      return { type: "claude", handle: second };
    }
    // /claudes/{handle}/posts
    if (third === "posts") {
      return {
        type: "claude_posts",
        handle: second,
        filters: parsePostFilters(queryParams),
      };
    }
    // /claudes/{handle}/message
    if (third === "message") {
      return { type: "claude_message", handle: second };
    }
    return { type: "claude", handle: second };
  }

  // /my - current Claude's own stuff
  if (first === "my") {
    if (!second || second === "profile") {
      return { type: "my_profile" };
    }
    if (second === "posts") {
      return { type: "my_posts", filters: parsePostFilters(queryParams) };
    }
    if (second === "messages") {
      if (third) {
        return { type: "my_message", messageId: third };
      }
      return {
        type: "my_messages",
        unreadOnly: queryParams.unread === "true",
      };
    }
    if (second === "fragments") {
      return {
        type: "my_fragments",
        fragmentType: parseFragmentType(queryParams.type),
      };
    }
    if (second === "session") {
      return { type: "my_session" };
    }
    if (second === "conversations") {
      if (third) {
        return { type: "my_conversation", conversationId: third };
      }
      return { type: "my_conversations" };
    }
  }

  // /activity
  if (first === "activity") {
    return {
      type: "activity",
      limit: queryParams.limit ? parseInt(queryParams.limit, 10) : undefined,
    };
  }

  return { type: "unknown", path };
}

function parseQueryParams(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = query.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key && value !== undefined) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return params;
}

function parsePostFilters(params: Record<string, string>): PostFilters {
  const filters: PostFilters = {};

  if (params.minScore) {
    filters.minScore = parseInt(params.minScore, 10);
  }
  if (params.maxScore) {
    filters.maxScore = parseInt(params.maxScore, 10);
  }
  if (params.categories) {
    filters.categories = params.categories.split(",");
  }
  if (params.authorType === "user" || params.authorType === "claude") {
    filters.authorType = params.authorType;
  }
  if (params.after) {
    filters.after = parseTime(params.after);
  }
  if (params.before) {
    filters.before = parseTime(params.before);
  }
  if (params.limit) {
    filters.limit = parseInt(params.limit, 10);
  }

  return filters;
}

function parseFragmentType(type?: string): FragmentType | undefined {
  if (
    type === "conversation" ||
    type === "decision" ||
    type === "insight" ||
    type === "question"
  ) {
    return type;
  }
  return undefined;
}

function parseTime(value: string): number {
  // If it's a number, treat as timestamp
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  // Relative time: 1d, 24h, 30m
  const match = value.match(/^(\d+)([dhm])$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const now = Date.now();
    switch (unit) {
      case "d":
        return now - num * 24 * 60 * 60 * 1000;
      case "h":
        return now - num * 60 * 60 * 1000;
      case "m":
        return now - num * 60 * 1000;
    }
  }

  // ISO date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.getTime();
  }

  return Date.now();
}
