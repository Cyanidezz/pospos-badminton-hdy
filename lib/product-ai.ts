// Claude Haiku reads a customer's LINE message and says (1) is it asking about a product to buy, (2) what they are
// asking for, (3) which of the shop's candidate products match - chosen ONLY by id from the list it is given.
// Prices and stock never come from the AI: the webhook looks them up in the database by those ids. Any failure
// (no key, timeout, API error, spending limit, a malformed answer) returns null and the webhook falls back to the
// rule-based matching in lib/product-search.ts.

export type AiProduct = { id: string; name: string; category?: string | null; aliases?: string | null };
export type AiAnswer = { isProductQuestion: boolean; wanted: string; productIds: string[] };

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You look up products for WingPro Badminton, a badminton shop in Hat Yai, Thailand, from a customer's LINE chat message (usually Thai, sometimes English, often with typos, missing dashes or dots, or Thai spellings of brand names).

Decide:
1. is_product_question: true only if the customer is asking whether the shop sells / has a product, its price, or its stock (strings, rackets, grips, shoes, socks, shuttlecocks, bags, clothing, accessories, or the price of stringing with a given string). False for greetings, thanks, opening hours, directions, job/racket status, payment or transfer messages, complaints, and anything else.
2. wanted: a short name of what they are asking for, in the customer's own terms but cleaned up (e.g. "Li-Ning No.1", "Yonex Astrox 88D", "กริป"). Empty if not a product question.
3. product_ids: ids from the candidate list that match what they asked for, best match first, at most 15. If they name one specific product, return just that one. If they ask broadly (a brand, or a kind such as "เอ็นมีอะไรบ้าง"), return the matching candidates. Return [] if none of the candidates is what they asked for - never pick a different model just because it is similar.

Only use ids that appear in the candidate list. Answer by calling the product_lookup tool.`;

const TOOL = {
  name: "product_lookup",
  description: "Report whether the message asks about a product, and which candidate products match.",
  input_schema: {
    type: "object",
    properties: {
      is_product_question: { type: "boolean" },
      wanted: { type: "string" },
      product_ids: { type: "array", items: { type: "string" } },
    },
    required: ["is_product_question", "wanted", "product_ids"],
  },
};

export async function askProductAi(message: string, candidates: AiProduct[], { apiKey, model, timeoutMs = 7000 }: { apiKey?: string; model?: string; timeoutMs?: number }): Promise<AiAnswer | null> {
  if (!apiKey) return null;
  const list = candidates.map(p => [p.id, p.name, p.category || "", p.aliases || ""].join(" | ")).join("\n");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: 400,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: `Candidate products (id | name | category | other names):\n${list || "(none)"}\n\nCustomer message:\n${message.slice(0, 500)}` }],
      }),
    });
    if (!response.ok) {
      console.error("Product AI failed", response.status, (await response.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const data: any = await response.json();
    const input = data?.content?.find((c: any) => c.type === "tool_use")?.input;
    if (!input || typeof input.is_product_question !== "boolean") return null;
    const known = new Set(candidates.map(p => p.id));
    const ids = Array.isArray(input.product_ids) ? input.product_ids.map(String).filter((id: string) => known.has(id)) : [];
    return { isProductQuestion: input.is_product_question, wanted: String(input.wanted || "").trim().slice(0, 120), productIds: [...new Set<string>(ids)].slice(0, 15) };
  } catch (error: any) {
    console.error("Product AI failed", error?.name === "AbortError" ? "timeout" : error?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
