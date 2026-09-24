import type { ExtractedDocumentChunk } from './document-repository';

// 公開助理內容不得包含類似帳密的指派值。僅遮蔽確實的值，避免因「需要管理員密碼」
// 這類安全操作說明而捨棄同頁的技術內容。
const CREDENTIAL_VALUE =
  /(\b(?:password|passwort|passcode|pin|api[ _-]?key|access[ _-]?token|secret|username|user[ _-]?name|login)\b\s*(?::|=)\s*)[^\s,;]+/gi;
const CREDENTIAL_IS_VALUE =
  /(\b(?:password|passwort|passcode|pin|api[ _-]?key|access[ _-]?token|secret|username|user[ _-]?name|login)\b\s+(?:is|ist)\s+)(?!required\b|needed\b|not\b|optional\b)[^\s,;]+/gi;

export type DocumentSafetyScreening = {
  safeChunks: ExtractedDocumentChunk[];
  excludedChunkCount: number;
};

export function screenDocumentChunksForAssistant(
  chunks: ExtractedDocumentChunk[],
): DocumentSafetyScreening {
  const safeChunks = chunks.map((chunk) => ({
    ...chunk,
    content: chunk.content
      .replace(CREDENTIAL_VALUE, '$1[已遮蔽]')
      .replace(CREDENTIAL_IS_VALUE, '$1[已遮蔽]'),
  }));
  return {
    safeChunks,
    excludedChunkCount: 0,
  };
}
