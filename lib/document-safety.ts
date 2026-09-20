import type { ExtractedDocumentChunk } from './document-repository';

// 公開助理內容不得包含類似帳密的指派值；規則保持精準，以保留一般技術術語。
const CREDENTIAL_ASSIGNMENT =
  /\b(?:password|passwort|passcode|pin|api[ _-]?key|access[ _-]?token|secret|username|user[ _-]?name|login)\b\s*(?::|=|is\b|ist\b)\s*[^\s,;]+/i;

export type DocumentSafetyScreening = {
  safeChunks: ExtractedDocumentChunk[];
  excludedChunkCount: number;
};

export function screenDocumentChunksForAssistant(
  chunks: ExtractedDocumentChunk[],
): DocumentSafetyScreening {
  const safeChunks = chunks.filter(
    (chunk) => !CREDENTIAL_ASSIGNMENT.test(chunk.content),
  );
  return {
    safeChunks,
    excludedChunkCount: chunks.length - safeChunks.length,
  };
}
