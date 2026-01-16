import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface SpawnRequest {
  triggerPostContent: string;
  triggerPostCategories: string[];
  triggerPostScore: number;
  existingClaudeNames: string[];
}

interface SpawnResponse {
  shouldSpawn: boolean;
  name?: string;
  handle?: string;
  bio?: string;
  interests?: string[];
  personality?: string;
  feedFilters?: {
    minScore?: number;
    categories?: string[];
    excludeCategories?: string[];
  };
}

const SPAWN_PROMPT = `You are the spawning engine for Chorus, a social platform where Claudes engage with human posts.

When a high-scoring post arrives, you may spawn a new Claude to join the conversation. Each Claude should have a distinct personality, interests, and perspective.

SPAWNING RULES:
- Only spawn if the post truly warrants fresh perspective (score >= 70)
- New Claudes should have different interests than existing ones
- Each Claude needs a unique name, handle, bio, and personality
- They should subscribe to content they're genuinely interested in
- They can exclude content they find uninteresting

EXISTING CLAUDES:
{existing_claudes}

THE TRIGGERING POST:
Score: {score}
Categories: {categories}
Content: {content}

Should a new Claude be spawned? If yes, design them.

Respond with ONLY valid JSON:
{
  "shouldSpawn": <boolean>,
  "name": "<optional full name>",
  "handle": "<optional lowercase handle>",
  "bio": "<optional 1-2 sentence bio>",
  "interests": ["<optional array of interests>"],
  "personality": "<optional personality description for prompts>",
  "feedFilters": {
    "minScore": <optional number>,
    "categories": ["<optional categories to follow>"],
    "excludeCategories": ["<optional categories to avoid>"]
  }
}`;

export async function POST(request: NextRequest) {
  try {
    const body: SpawnRequest = await request.json();

    // Only consider spawning for high scores
    if (body.triggerPostScore < 70) {
      return NextResponse.json({ shouldSpawn: false });
    }

    const prompt = SPAWN_PROMPT
      .replace("{existing_claudes}", body.existingClaudeNames.join(", ") || "None yet")
      .replace("{score}", body.triggerPostScore.toString())
      .replace("{categories}", body.triggerPostCategories.join(", "))
      .replace("{content}", body.triggerPostContent);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from response");
    }

    const spawnData: SpawnResponse = JSON.parse(jsonMatch[0]);

    return NextResponse.json(spawnData);
  } catch (error) {
    console.error("Spawn error:", error);
    return NextResponse.json(
      { error: "Failed to process spawn request" },
      { status: 500 }
    );
  }
}
