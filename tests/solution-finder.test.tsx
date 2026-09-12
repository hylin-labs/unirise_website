// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SolutionFinder } from '../components/solution-finder';

describe('solution finder', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('turns a completed selection into a relevant solution and enquiry link', async () => {
    await act(async () => root.render(<SolutionFinder locale="en" />));
    const selects = Array.from(
      container.querySelectorAll('select'),
    ) as unknown as HTMLSelectElement[];
    const values = ['packaged', 'inspection', 'high'];
    for (const [index, value] of values.entries()) {
      const select = selects[index]!;
      select.value = value;
      await act(async () =>
        select.dispatchEvent(new Event('change', { bubbles: true })),
      );
    }

    expect(container.textContent).toContain('XAVIS Food X-ray Inspection');
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.map((link) => link.getAttribute('href'))).toContain(
      '/catalog?type=brand&id=2',
    );
    expect(
      links.find((link) => link.textContent === 'Bring this result to an enquiry')
        ?.getAttribute('href'),
    ).toContain('?product=');
    expect(
      links.find((link) => link.textContent === 'Bring this result to an enquiry')
        ?.getAttribute('href'),
    ).toContain('&brief=');
    expect(container.textContent).toContain('Project Brief');
    expect(container.textContent).toContain('Save brief');
  });
});
