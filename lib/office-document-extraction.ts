import { unzipSync } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';
import type { DocumentMimeType } from './document-repository';

const MAX_OFFICE_TEXT_BYTES = 20_000_000;

type ExtractedPages = { pages: string[]; pageCount: number };

function xmlText(value: Uint8Array) {
  return new TextDecoder()
    .decode(value)
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<a:br[^>]*\/>/g, '\n')
    .replace(/<\/(?:w|a):p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:x([0-9a-fA-F]+)|(\d+));/g, (_, hex, decimal) =>
      String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)),
    )
    .trim();
}

function officeFiles(bytes: Uint8Array, matches: (name: string) => boolean) {
  let totalSize = 0;
  let exceededLimit = false;
  const files = unzipSync(bytes, {
    filter: (entry) => {
      if (!matches(entry.name)) return false;
      totalSize += entry.originalSize;
      if (totalSize > MAX_OFFICE_TEXT_BYTES) {
        exceededLimit = true;
        return false;
      }
      return true;
    },
  });
  if (exceededLimit) throw new Error('office_document_text_is_too_large');
  return files;
}

function slideNumber(name: string) {
  return Number.parseInt(name.match(/slide(\d+)\.xml$/)?.[1] ?? '0', 10);
}

async function extractPdfPages(bytes: Uint8Array): Promise<ExtractedPages> {
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  return { pages, pageCount: extracted.totalPages };
}

function extractDocxPages(bytes: Uint8Array): ExtractedPages {
  const files = officeFiles(bytes, (name) => name === 'word/document.xml');
  const document = files['word/document.xml'];
  if (!document) throw new Error('invalid_docx_document');
  return { pages: [xmlText(document)], pageCount: 1 };
}

function extractPptxPages(bytes: Uint8Array): ExtractedPages {
  const files = officeFiles(bytes, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const slides = Object.entries(files)
    .sort(([left], [right]) => slideNumber(left) - slideNumber(right))
    .map(([, content]) => xmlText(content));
  if (!slides.length) throw new Error('invalid_pptx_presentation');
  return { pages: slides, pageCount: slides.length };
}

export async function extractDocumentPages(
  buffer: ArrayBuffer,
  mimeType: DocumentMimeType,
): Promise<ExtractedPages> {
  const bytes = new Uint8Array(buffer);
  if (mimeType === 'application/pdf') return extractPdfPages(bytes);
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return extractDocxPages(bytes);
  return extractPptxPages(bytes);
}
