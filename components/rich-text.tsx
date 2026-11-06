import { Fragment, type ElementType, type ReactNode } from 'react';

type RichTextNode =
  | string
  | {
      kind: 'bold' | 'italic' | 'size' | 'color';
      value?: string;
      children: RichTextNode[];
    };

const formatToken =
  /\[\[(\/)?(b|i|size(?::(?:small|large))?|color(?::(?:red|orange|blue|green|purple))?)\]\]/g;

const formatLabels = {
  bold: { open: '[[b]]', close: '[[/b]]' },
  italic: { open: '[[i]]', close: '[[/i]]' },
  small: { open: '[[size:small]]', close: '[[/size]]' },
  large: { open: '[[size:large]]', close: '[[/size]]' },
} as const;

export const richTextColors = [
  { value: 'red', label: '紅色' },
  { value: 'orange', label: '橘色' },
  { value: 'blue', label: '藍色' },
  { value: 'green', label: '綠色' },
  { value: 'purple', label: '紫色' },
] as const;

export const richTextFormats = {
  ...formatLabels,
  color(value: (typeof richTextColors)[number]['value']) {
    return { open: `[[color:${value}]]`, close: '[[/color]]' };
  },
};

function formatType(token: string) {
  if (token === 'b') return { kind: 'bold' as const, closing: 'b' };
  if (token === 'i') return { kind: 'italic' as const, closing: 'i' };
  if (token.startsWith('size')) {
    return {
      kind: 'size' as const,
      value: token.split(':')[1],
      closing: 'size',
    };
  }
  return {
    kind: 'color' as const,
    value: token.split(':')[1],
    closing: 'color',
  };
}

function appendText(target: { children: RichTextNode[] }, value: string) {
  if (value) target.children.push(value);
}

function parseRichText(value: string) {
  const root = { children: [] as RichTextNode[] };
  const stack: Array<{
    node: Exclude<RichTextNode, string>;
    closing: string;
  }> = [];
  let cursor = 0;

  for (const match of value.matchAll(formatToken)) {
    const index = match.index ?? 0;
    const token = match[2];
    if (!token) continue;
    const current = stack.at(-1)?.node ?? root;
    appendText(current, value.slice(cursor, index));
    const type = formatType(token);

    if (match[1]) {
      if (stack.at(-1)?.closing === type.closing) {
        stack.pop();
      } else {
        appendText(current, match[0]);
      }
    } else {
      const node: Exclude<RichTextNode, string> = {
        kind: type.kind,
        value: type.value,
        children: [],
      };
      current.children.push(node);
      stack.push({ node, closing: type.closing });
    }
    cursor = index + match[0].length;
  }

  appendText(stack.at(-1)?.node ?? root, value.slice(cursor));
  return root.children;
}

function lineBreaks(value: string, key: string) {
  return value.split('\n').map((line, index) => (
    <Fragment key={`${key}-${index}`}>
      {index ? <br /> : null}
      {line}
    </Fragment>
  ));
}

function renderNodes(nodes: RichTextNode[], prefix = 'rich'): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    if (typeof node === 'string') return <Fragment key={key}>{lineBreaks(node, key)}</Fragment>;
    const children = renderNodes(node.children, key);
    if (node.kind === 'bold') return <strong key={key}>{children}</strong>;
    if (node.kind === 'italic') return <em key={key}>{children}</em>;
    if (node.kind === 'size')
      return (
        <span className={`rich-text-size-${node.value}`} key={key}>
          {children}
        </span>
      );
    return (
      <span className={`rich-text-color-${node.value}`} key={key}>
        {children}
      </span>
    );
  });
}

export function RichText({
  as: Tag = 'p',
  className,
  text,
}: {
  as?: ElementType;
  className?: string;
  text: string;
}) {
  return <Tag className={className}>{renderNodes(parseRichText(text))}</Tag>;
}

export function richTextToPlainText(value: string) {
  return value.replace(formatToken, '');
}

export function applyRichTextFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  format: { open: string; close: string },
) {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const selected = value.slice(start, end);
  return {
    value: `${value.slice(0, start)}${format.open}${selected}${format.close}${value.slice(end)}`,
    selectionStart: start + format.open.length,
    selectionEnd: start + format.open.length + selected.length,
  };
}
