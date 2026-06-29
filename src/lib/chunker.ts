const CHUNK_SIZE = 3000;
const OVERLAP_SIZE = 300;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface Chunk {
  index: number;
  text: string;
  context: string;
}

export function chunkText(text: string): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: Chunk[] = [];
  let currentChunk = "";
  let previousChunk = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const tentative = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;

    if (estimateTokens(tentative) > CHUNK_SIZE && currentChunk) {
      const context = getContextTail(currentChunk);

      chunks.push({
        index: chunks.length,
        text: currentChunk,
        context,
      });

      previousChunk = currentChunk;
      currentChunk = trimmed;
    } else {
      currentChunk = tentative;
    }
  }

  if (currentChunk) {
    const context = getContextTail(currentChunk);
    chunks.push({
      index: chunks.length,
      text: currentChunk,
      context,
    });
  }

  return chunks;
}

function getContextTail(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const contextSentences: string[] = [];
  let contextTokens = 0;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentenceTokens = estimateTokens(sentences[i]);
    if (contextTokens + sentenceTokens > OVERLAP_SIZE) break;
    contextSentences.unshift(sentences[i]);
    contextTokens += sentenceTokens;
  }

  return contextSentences.join(" ");
}
