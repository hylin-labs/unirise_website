import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  applyRichTextFormat,
  RichText,
  richTextToPlainText,
} from '../components/rich-text';

describe('受限文字格式', () => {
  it('只將支援的格式標記轉成安全的公開標籤', () => {
    const html = renderToStaticMarkup(
      <RichText
        text={'[[b]]重要[[/b]]\n[[color:blue]][[i]]技術資訊[[/i]][[/color]]'}
      />,
    );

    expect(html).toContain('<strong>重要</strong>');
    expect(html).toContain('<br/>');
    expect(html).toContain('class="rich-text-color-blue"');
    expect(html).toContain('<em>技術資訊</em>');
    expect(html).not.toContain('[[b]]');
  });

  it('不會將一般輸入轉成 HTML', () => {
    const html = renderToStaticMarkup(<RichText text={'<script>alert(1)</script>'} />);

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('可在選取範圍套用格式並保留可搜尋的純文字', () => {
    expect(
      applyRichTextFormat('厚度穩定', 0, 2, {
        open: '[[b]]',
        close: '[[/b]]',
      }),
    ).toEqual({
      value: '[[b]]厚度[[/b]]穩定',
      selectionStart: 5,
      selectionEnd: 7,
    });
    expect(richTextToPlainText('[[b]]厚度[[/b]]穩定')).toBe('厚度穩定');
  });
});
