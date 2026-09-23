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
    const values = ['packaged', 'inspection', 'high', 'quality'];
    for (const value of values) {
      const select = container.querySelector('select') as HTMLSelectElement;
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
    expect(container.textContent).toContain('Product scope: Packaged, canned, or bottled food');
    expect(container.textContent).toContain('Capacity discussion: High-capacity or multi-line production');
    expect(container.textContent).toContain('Primary priority: Quality and consistency');
    expect(container.textContent).toContain('Save project draft');
    expect(container.textContent).toContain('Download specification brief');
    expect(container.textContent).toContain('Create solution passport link');
  });
});
