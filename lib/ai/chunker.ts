/**
 * Recursive text chunking utility for RAG vectorization.
 * Breaks large documents into semantically coherent overlapping chunks.
 */

export interface TextChunk {
  chunkIndex: number;
  content: string;
  charCount: number;
}

interface ChunkOptions {
  maxChunkSize?: number; // default ~1000 chars
  overlap?: number;      // default ~150 chars
  headerPrefix?: string; // Optional entity title prefix for every chunk
}

/**
 * Splits text into chunks respecting paragraph and line breaks when possible.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChunkSize = options.maxChunkSize ?? 1000;
  const overlap = options.overlap ?? 150;
  const headerPrefix = options.headerPrefix?.trim() ? `${options.headerPrefix.trim()}\n\n` : "";

  const trimmed = text.trim();
  if (!trimmed) return [];

  // If entire text with header fits in one chunk
  if ((headerPrefix.length + trimmed.length) <= maxChunkSize) {
    return [
      {
        chunkIndex: 0,
        content: `${headerPrefix}${trimmed}`,
        charCount: headerPrefix.length + trimmed.length,
      },
    ];
  }

  // Split by double line breaks (paragraphs) first, then single line breaks, then sentences
  const paragraphs = trimmed.split(/\n\s*\n/);
  const chunks: TextChunk[] = [];

  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // If adding this paragraph exceeds maxChunkSize
    if (currentChunk.length + trimmedPara.length + 2 > maxChunkSize) {
      if (currentChunk.length > 0) {
        chunks.push({
          chunkIndex,
          content: `${headerPrefix}${currentChunk.trim()}`,
          charCount: headerPrefix.length + currentChunk.trim().length,
        });
        chunkIndex++;

        // Keep the overlap from the end of currentChunk
        const overlapText = currentChunk.slice(-overlap).trim();
        currentChunk = overlapText ? `${overlapText}\n\n` : "";
      }

      // If a single paragraph is larger than maxChunkSize, split by sentences or hard chunks
      if (trimmedPara.length > maxChunkSize) {
        const sentences = trimmedPara.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [trimmedPara];
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
            chunks.push({
              chunkIndex,
              content: `${headerPrefix}${currentChunk.trim()}`,
              charCount: headerPrefix.length + currentChunk.trim().length,
            });
            chunkIndex++;
            currentChunk = "";
          }
          currentChunk += sentence;
        }
      } else {
        currentChunk += trimmedPara + "\n\n";
      }
    } else {
      currentChunk += trimmedPara + "\n\n";
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      chunkIndex,
      content: `${headerPrefix}${currentChunk.trim()}`,
      charCount: headerPrefix.length + currentChunk.trim().length,
    });
  }

  return chunks;
}
