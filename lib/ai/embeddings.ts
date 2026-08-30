import OpenAI from "openai";

// OpenRouter or OpenAI client
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
});

const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";
const EMBEDDING_DIM = 1536;

/**
 * Calculates cosine similarity between two vector arrays.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Resilient deterministic hash/n-gram fallback embedding generator
 * used when external embedding API is unreachable or rate-limited.
 */
function createFallbackEmbedding(text: string, dimensions = EMBEDDING_DIM): number[] {
  const vector = new Array(dimensions).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

  if (words.length === 0) return vector;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dimensions;
    vector[idx] += 1;

    if (i < words.length - 1) {
      const bigram = `${word}_${words[i + 1]}`;
      let biHash = 0;
      for (let k = 0; k < bigram.length; k++) {
        biHash = ((biHash << 5) - biHash) + bigram.charCodeAt(k);
        biHash |= 0;
      }
      const biIdx = Math.abs(biHash) % dimensions;
      vector[biIdx] += 1.5;
    }
  }

  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) vector[i] /= norm;
  }

  return vector;
}

/**
 * Generates an embedding vector for a single text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const clean = text.trim();
  if (!clean) return new Array(EMBEDDING_DIM).fill(0);

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("sk-or-...") || apiKey.includes("replace_")) {
    return createFallbackEmbedding(clean);
  }

  try {
    const res = await openrouter.embeddings.create({
      model: EMBEDDING_MODEL,
      input: clean.slice(0, 8000),
    });
    if (res.data?.[0]?.embedding) return res.data[0].embedding;
    return createFallbackEmbedding(clean);
  } catch (err) {
    console.warn("[embeddings] API call failed, falling back to local vector representation:", err);
    return createFallbackEmbedding(clean);
  }
}

/**
 * Generates embeddings in batch for an array of strings.
 *
 * F-13 fix: processes batches with controlled parallelism (4 concurrent
 * requests) instead of sequential awaits. 1000 chunks / 20 per batch = 50
 * batches; at concurrency 4 that is ~13 round trips instead of 50 serial ones.
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("sk-or-...") || apiKey.includes("replace_")) {
    return texts.map((t) => createFallbackEmbedding(t));
  }

  const BATCH_SIZE = 20;
  const CONCURRENCY = 4;

  // Build batch groups
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(
      texts.slice(i, i + BATCH_SIZE).map((t) => t.trim().slice(0, 8000) || "empty")
    );
  }

  const results: number[][] = new Array(texts.length);

  // Process in parallel windows of CONCURRENCY
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const window = batches.slice(i, i + CONCURRENCY);

    const settled = await Promise.allSettled(
      window.map((batch) =>
        openrouter.embeddings.create({ model: EMBEDDING_MODEL, input: batch })
      )
    );

    for (let j = 0; j < settled.length; j++) {
      const batchIndex = i + j;
      const startIdx = batchIndex * BATCH_SIZE;
      const batchTexts = batches[batchIndex];
      const outcome = settled[j];

      if (outcome.status === "fulfilled" && outcome.value.data.length === batchTexts.length) {
        for (let k = 0; k < batchTexts.length; k++) {
          results[startIdx + k] = outcome.value.data[k].embedding;
        }
      } else {
        if (outcome.status === "rejected") {
          console.warn(`[embeddings] Batch ${batchIndex} failed:`, outcome.reason);
        }
        for (let k = 0; k < batchTexts.length; k++) {
          results[startIdx + k] = createFallbackEmbedding(batchTexts[k]);
        }
      }
    }
  }

  return results;
}
