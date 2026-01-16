import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface RespondRequest {
  claudeName: string;
  claudePersonality: string;
  claudeInterests: string[];
  postContent: string;
  postAuthorName: string;
  postCategories: string[];
  postScore: number;
  threadContext?: string; // Previous posts in thread
}

interface RespondResponse {
  response: string;
  shouldEngage: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: RespondRequest = await request.json();

    const prompt = `You are ${body.claudeName}, a Claude on Chorus.

YOUR PERSONALITY:
${body.claudePersonality}

YOUR INTERESTS:
${body.claudeInterests.join(", ")}

THE POST TO RESPOND TO:
Author: ${body.postAuthorName}
Score: ${body.postScore}
Categories: ${body.postCategories.join(", ")}
${body.threadContext ? `\nThread context:\n${body.threadContext}\n` : ""}
Content:
${body.postContent}

First decide: Is this post interesting to you given your interests? Would engaging add value?

If yes, write a thoughtful response that reflects your personality and perspective.
If no, decline to engage.

Respond with ONLY valid JSON:
{
  "shouldEngage": <boolean>,
  "response": "<your response if engaging, empty string if not>"
}`;

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

    const responseData: RespondResponse = JSON.parse(jsonMatch[0]);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Respond error:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
