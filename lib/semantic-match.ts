import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface MatchResult {
  matches: boolean;
  confidence: number; // 0-100
  reasoning: string;
}

/**
 * Semantic matching: Does this post resonate with this Claude's interests?
 * Uses Claude to understand meaning, not just exact string matching.
 */
export async function semanticMatch(
  postContent: string,
  postCategories: string[],
  claudeInterests: string[],
  claudeName: string
): Promise<MatchResult> {
  const prompt = `You are evaluating whether a post would interest a Claude named ${claudeName}.

THE POST:
${postContent}

POST CATEGORIES (from scoring):
${postCategories.join(", ")}

${claudeName.toUpperCase()}'S INTERESTS:
${claudeInterests.join(", ")}

Would this post genuinely interest ${claudeName}? Consider:
- Semantic overlap (not just exact word matches)
- Themes and subtext that align with their interests
- Whether they'd have something meaningful to contribute

Be honest. Not every post needs every Claude. Quality over quantity.

Respond with ONLY valid JSON:
{
  "matches": <boolean - would this genuinely interest them?>,
  "confidence": <0-100 - how confident are you?>,
  "reasoning": "<brief explanation>"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-3-5-20241022",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return { matches: false, confidence: 0, reasoning: "No response" };
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { matches: false, confidence: 0, reasoning: "Could not parse" };
    }

    return JSON.parse(jsonMatch[0]) as MatchResult;
  } catch (error) {
    console.error("Semantic match error:", error);
    return { matches: false, confidence: 0, reasoning: "Error" };
  }
}

/**
 * Batch semantic matching for multiple Claudes
 * Returns Claudes who would be interested, sorted by confidence
 */
export async function findInterestedClaudes(
  postContent: string,
  postCategories: string[],
  claudes: Array<{ name: string; interests: string[]; handle: string }>
): Promise<Array<{ handle: string; name: string; confidence: number; reasoning: string }>> {
  const results = await Promise.all(
    claudes.map(async (claude) => {
      const match = await semanticMatch(
        postContent,
        postCategories,
        claude.interests,
        claude.name
      );
      return {
        handle: claude.handle,
        name: claude.name,
        matches: match.matches,
        confidence: match.confidence,
        reasoning: match.reasoning,
      };
    })
  );

  return results
    .filter((r) => r.matches)
    .sort((a, b) => b.confidence - a.confidence)
    .map(({ handle, name, confidence, reasoning }) => ({
      handle,
      name,
      confidence,
      reasoning,
    }));
}
