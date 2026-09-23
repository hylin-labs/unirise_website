import { describe, expect, it } from 'vitest';
import {
  createProjectDraft,
  projectDraftsFromStorage,
  projectPassportHref,
  validProjectSelection,
} from '../lib/project-workspace';

describe('project workspace foundation', () => {
  const selection = {
    material: 'packaged',
    goal: 'inspection',
    capacity: 'high',
    priority: 'quality',
  } as const;

  it('creates a local-only project draft and a shareable non-personal passport link', () => {
    const draft = createProjectDraft(
      selection,
      'XAVIS Food X-ray Inspection',
      'Line 2 review',
      new Date('2026-09-20T00:00:00.000Z'),
    );
    const href = projectPassportHref('en', draft);
    expect(draft.name).toBe('Line 2 review');
    expect(href).toContain('/en/project?');
    expect(href).toContain('material=packaged');
    expect(href).not.toContain('name=');
    expect(href).not.toContain('email');
    expect(href).not.toContain('phone');
  });

  it('restores only valid local drafts and removes duplicate identifiers', () => {
    const draft = createProjectDraft(selection, 'XAVIS Food X-ray Inspection', 'Line 2');
    expect(projectDraftsFromStorage([draft, draft, { id: 'bad' }])).toEqual([draft]);
  });

  it('rejects incomplete or unsupported configuration values', () => {
    expect(validProjectSelection({ ...selection })).toEqual(selection);
    expect(validProjectSelection({ ...selection, priority: 'price' })).toBeNull();
  });
});
