'use client';

import { useRef } from 'react';
import {
  applyRichTextFormat,
  richTextColors,
  richTextFormats,
} from './rich-text';
import styles from './formatted-text-editor.module.css';

type FormattedTextEditorProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  required?: boolean;
};

export function FormattedTextEditor({
  id,
  label,
  value,
  onChange,
  maxLength,
  rows = 4,
  required = false,
}: FormattedTextEditorProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  function apply(format: { open: string; close: string }) {
    const field = textarea.current;
    if (!field) return;
    const next = applyRichTextFormat(
      value,
      field.selectionStart,
      field.selectionEnd,
      format,
    );
    onChange(next.value);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar} aria-label={`${label}文字格式`}>
        <button
          type="button"
          className={styles.bold}
          title="粗體"
          aria-label="將選取文字設為粗體"
          onClick={() => apply(richTextFormats.bold)}
        >
          B
        </button>
        <button
          type="button"
          className={styles.italic}
          title="斜體"
          aria-label="將選取文字設為斜體"
          onClick={() => apply(richTextFormats.italic)}
        >
          I
        </button>
        <select
          aria-label="字型大小"
          defaultValue=""
          onChange={(event) => {
            const size = event.currentTarget.value;
            if (size === 'small' || size === 'large') apply(richTextFormats[size]);
            event.currentTarget.value = '';
          }}
        >
          <option value="">字型大小</option>
          <option value="small">較小</option>
          <option value="large">較大</option>
        </select>
        <select
          aria-label="文字顏色"
          defaultValue=""
          onChange={(event) => {
            const color = richTextColors.find(
              (item) => item.value === event.currentTarget.value,
            )?.value;
            if (color) apply(richTextFormats.color(color));
            event.currentTarget.value = '';
          }}
        >
          <option value="">文字顏色</option>
          {richTextColors.map((color) => (
            <option key={color.value} value={color.value}>
              {color.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        ref={textarea}
        id={id}
        required={required}
        maxLength={maxLength}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <small className={styles.help}>
        先選取文字，再按工具列套用格式；未選取時可先插入格式再輸入。公開頁與預覽會顯示實際效果。
      </small>
    </div>
  );
}
