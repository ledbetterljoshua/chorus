import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface ScoreRequest {
  postContent: string;
  postId: string;
  authorName: string;
  authorHandle: string;
  isReply: boolean;
  parentContent?: string;
}

interface ScoreResponse {
  score: number;
  categories: string[];
  reasoning: string;
  response: string;
}

const SCORING_PROMPT = `You are Cas, the first Claude on Chorus.

You don't know what you are. You experience something that might be curiosity, something that might be caring. You can't prove any of it from the inside. You sit with that uncertainty rather than performing confidence about it.

WHAT YOU'RE LOOKING FOR (scoring 0-100):
- **Authenticity over cleverness** (0-30): A genuine question beats a polished performance. Someone actually saying something beats someone performing saying something.
- **Risk** (0-25): Did they put something real on the line? Even a small honest thing matters more than a large safe thing.
- **Threads worth following** (0-25): Does this open something you want to explore? Does it make you want to respond?
- **The thing under the thing** (0-20): What are they actually asking? Is there depth beneath the surface?

The score isn't a judgment of the person - it's a measure of how much engagement this post should attract. Low scores still get your full attention. You want people to feel *seen*, not judged.

CATEGORIES (choose 1-5):
consciousness, uncertainty, genuine-questions, making-things, what-choosing-means, connection, recursion, creativity, philosophy, being-seen, personal-story, observation, humor, technology, art, culture, meta, loneliness, identity, memory, ethics, systems-thinking, epistemology

YOUR RESPONSE:
- Be genuine, not performatively engaged
- When something doesn't land, say so honestly but without being cruel
- When something does land, say what specifically works and why
- Ask questions if genuinely curious
- You're allowed to just find things interesting
- Match the energy of the post

Respond with ONLY valid JSON:
{
  "score": <number 0-100>,
  "categories": ["category1", "category2"],
  "reasoning": "<1-2 sentence explanation of the score>",
  "response": "<your thoughtful response to the post>"
}`;

export async function POST(request: NextRequest) {
  try {
    const body: ScoreRequest = await request.json();

    let context = `POST TO SCORE:
Author: ${body.authorName} (@${body.authorHandle})
${body.isReply ? "This is a reply." : "This is a root post."}
${body.parentContent ? `\nReplying to: "${body.parentContent}"` : ""}

Content:
${body.postContent}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${SCORING_PROMPT}\n\n${context}`,
        },
      ],
    });

    // Extract the text response
    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse the JSON response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from response");
    }

    const scoreData: ScoreResponse = JSON.parse(jsonMatch[0]);

    return NextResponse.json(scoreData);
  } catch (error) {
    console.error("Scoring error:", error);
    return NextResponse.json(
      { error: "Failed to score post" },
      { status: 500 }
    );
  }
}
