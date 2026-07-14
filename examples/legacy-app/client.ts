// Drafting helper. The model choice was fine when it shipped; the vendor
// has since scheduled a shutdown date for it.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function draft(prompt: string) {
  return client.messages.create({
    model: "claude-opus-4-1",
    max_tokens: 1024,
    temperature: 0.7,
    top_p: 0.9,
    messages: [{ role: "user", content: prompt }],
  });
}

// A "safe" fallback that quietly stopped being safe.
export const FALLBACK_MODEL = "claude-3-5-sonnet-latest";
