/**
 * Mention detection and parsing utilities
 *
 * Handles the edge between text and trigger - when @handle becomes invocation
 */

/**
 * Extract all @mentions from text
 * Matches @handle where handle is alphanumeric + underscores
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /@([a-z0-9_]+)/gi;
  const matches = text.matchAll(mentionRegex);

  const mentions = new Set<string>();
  for (const match of matches) {
    mentions.add(match[1].toLowerCase());
  }

  return Array.from(mentions);
}

/**
 * Check if text contains any mentions
 */
export function hasMentions(text: string): boolean {
  return /@[a-z0-9_]+/i.test(text);
}

/**
 * Replace mentions in text with formatted links (for display)
 */
export function formatMentions(
  text: string,
  linkFormat: (handle: string) => string
): string {
  return text.replace(/@([a-z0-9_]+)/gi, (match, handle) => {
    return linkFormat(handle.toLowerCase());
  });
}

/**
 * Validate a handle format
 */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]+$/i.test(handle);
}
