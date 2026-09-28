// USD per 1M tokens, from OpenAI's model pages (checked 28 Sep 2026).
// Used only to estimate spend for the in-app monthly cap — OpenAI's own usage
// dashboard is the source of truth. Unknown models are costed at the most
// expensive known rate so the cap errs on the safe side.
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-6-sol": { input: 2, output: 10 },
  "gpt-6-astra": { input: 10, output: 50 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
}
const FALLBACK = PRICES["gpt-6-astra"]

export function priceFor(model: string) {
  const exact = PRICES[model]
  if (exact) return { ...exact, known: true }
  const prefix = Object.keys(PRICES).find((k) => model.startsWith(k))
  return prefix ? { ...PRICES[prefix], known: true } : { ...FALLBACK, known: false }
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model)
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

export const RECOMMENDED_MODEL = "gpt-6-luna"
