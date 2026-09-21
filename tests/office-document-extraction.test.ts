import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractDocumentPages } from '../lib/office-document-extraction';

function asArrayBuffer(value: Uint8Array) {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

describe('Office document text extraction', () => {
  it('extracts readable text from a DOCX document body', async () => {
    const archive = zipSync({
      'word/document.xml': strToU8(
        '<w:document><w:body><w:p><w:r><w:t>Flow rate: 120 kg/h</w:t></w:r></w:p><w:p><w:r><w:t>Inspect filters daily.</w:t></w:r></w:p></w:body></w:document>',
      ),
    });

    await expect(
      extractDocumentPages(
        asArrayBuffer(archive),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).resolves.toEqual({
      pageCount: 1,
      pages: ['Flow rate: 120 kg/h\nInspect filters daily.'],
    });
  });

  it('extracts PowerPoint slides in their presentation order', async () => {
    const archive = zipSync({
      'ppt/slides/slide2.xml': strToU8(
        '<p:sld><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:sld>',
      ),
      'ppt/slides/slide1.xml': strToU8(
        '<p:sld><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p:sld>',
      ),
    });

    await expect(
      extractDocumentPages(
        asArrayBuffer(archive),
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ),
    ).resolves.toEqual({
      pageCount: 2,
      pages: ['First slide', 'Second slide'],
    });
  });
});
