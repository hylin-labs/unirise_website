import type { ExtractedDocumentChunk } from './document-repository';

const CHUNK_LENGTH = 1_800;
const MAX_EXTRACTED_CHARACTERS = 400_000;

function cleanText(value: string) {
  return value
    .replaceAll(String.fromCharCode(0), '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitLongText(value: string) {
  const parts: string[] = [];
  let remaining = value;
  while (remaining.length > CHUNK_LENGTH) {
    const preferredBreak = remaining.lastIndexOf(' ', CHUNK_LENGTH);
    const breakAt =
      preferredBreak >= Math.floor(CHUNK_LENGTH * 0.6)
        ? preferredBreak
        : CHUNK_LENGTH;
    parts.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export function chunkExtractedPages(pages: string[]) {
  const chunks: ExtractedDocumentChunk[] = [];
  let buffer = '';
  let pageStart = 1;
  let pageEnd = 1;
  let characterCount = 0;

  for (const [index, rawPage] of pages.entries()) {
    const page = cleanText(rawPage);
    if (!page) continue;
    for (const part of splitLongText(page)) {
      if (!buffer) pageStart = index + 1;
      const next = buffer ? `${buffer}\n\n${part}` : part;
      if (next.length > CHUNK_LENGTH && buffer) {
        chunks.push({ content: buffer, pageStart, pageEnd });
        characterCount += buffer.length;
        buffer = part;
        pageStart = index + 1;
      } else {
        buffer = next;
      }
      pageEnd = index + 1;
    }
  }
  if (buffer) {
    chunks.push({ content: buffer, pageStart, pageEnd });
    characterCount += buffer.length;
  }
  if (characterCount > MAX_EXTRACTED_CHARACTERS) {
    let remaining = MAX_EXTRACTED_CHARACTERS;
    const limited = chunks.flatMap((chunk) => {
      if (remaining <= 0) return [];
      const content = chunk.content.slice(0, remaining);
      remaining -= content.length;
      return content ? [{ ...chunk, content }] : [];
    });
    return { chunks: limited, characterCount: MAX_EXTRACTED_CHARACTERS };
  }
  return { chunks, characterCount };
}
