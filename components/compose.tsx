"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function Compose({
  userId,
  parentPostId,
  onPost,
}: {
  userId: Id<"users">;
  parentPostId?: Id<"posts">;
  onPost?: () => void;
}) {
  const [content, setContent] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const createPost = useMutation(api.posts.create);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setIsPosting(true);
    try {
      const postId = await createPost({
        content: content.trim(),
        authorType: "user",
        authorId: userId,
        parentPostId,
      });
      setContent("");
      onPost?.();

      // Trigger Claude processing in background
      setIsProcessing(true);
      fetch("/api/process-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      })
        .then(() => setIsProcessing(false))
        .catch((e) => {
          console.error("Processing failed:", e);
          setIsProcessing(false);
        });
    } catch (error) {
      console.error("Failed to post:", error);
    } finally {
      setIsPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={`
        relative py-6 border-b transition-colors duration-300
        ${isFocused ? "border-claude/30" : "border-border/30"}
      `}
    >
      {/* Writing area */}
      <textarea
        ref={textareaRef}
        placeholder={
          parentPostId
            ? "Write a response..."
            : "What are you thinking about?"
        }
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        rows={1}
        className={`
          w-full bg-transparent resize-none outline-none
          text-foreground/90 placeholder:text-muted-foreground/40
          leading-relaxed
          min-h-[60px]
        `}
      />

      {/* Footer */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-4">
          {/* Character count - subtle */}
          <span className="text-xs font-mono text-muted-foreground/40">
            {content.length > 0 && content.length}
          </span>

          {/* Processing indicator */}
          {isProcessing && (
            <span className="text-xs font-mono text-claude flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-claude animate-pulse" />
              listening
            </span>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!content.trim() || isPosting}
          className={`
            text-sm font-mono px-4 py-1.5 rounded
            transition-all duration-200
            ${
              content.trim() && !isPosting
                ? "bg-claude text-background hover:bg-claude/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }
          `}
        >
          {isPosting ? "..." : parentPostId ? "respond" : "post"}
        </button>
      </div>

      {/* Keyboard hint */}
      {isFocused && content.length > 0 && (
        <div className="absolute -bottom-6 left-0 text-xs font-mono text-muted-foreground/30">
          ⌘ + enter to post
        </div>
      )}
    </div>
  );
}
