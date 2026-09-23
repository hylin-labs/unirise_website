import type { Locale } from './locales';

export type ProjectMaterial =
  | 'fresh'
  | 'protein'
  | 'packaged'
  | 'recycled'
  | 'plastics';
export type ProjectGoal =
  | 'sorting'
  | 'inspection'
  | 'weighing'
  | 'packing'
  | 'recycling'
  | 'materials';
export type ProjectCapacity = 'pilot' | 'growing' | 'high';
export type ProjectPriority = 'quality' | 'throughput' | 'automation' | 'safety';

export type ProjectSelection = {
  material: ProjectMaterial;
  goal: ProjectGoal;
  capacity: ProjectCapacity;
  priority: ProjectPriority;
};

export type ProjectDraft = ProjectSelection & {
  id: string;
  name: string;
  recommendation: string;
  createdAt: string;
  updatedAt: string;
};

export const projectWorkspaceStorageKey = 'unirise-project-workspaces-v1';

export function createProjectDraft(
  selection: ProjectSelection,
  recommendation: string,
  name: string,
  now = new Date(),
): ProjectDraft {
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    ...selection,
    recommendation,
    name: name.trim().slice(0, 80) || recommendation,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function projectPassportHref(locale: Locale, draft: ProjectDraft) {
  const params = new URLSearchParams({
    recommendation: draft.recommendation,
    material: draft.material,
    goal: draft.goal,
    capacity: draft.capacity,
    priority: draft.priority,
  });
  return `${locale === 'en' ? '/en/project' : '/project'}?${params.toString()}`;
}

export function projectDraftsFromStorage(value: unknown): ProjectDraft[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const selection = validProjectSelection({
      material: typeof candidate.material === 'string' ? candidate.material : '',
      goal: typeof candidate.goal === 'string' ? candidate.goal : '',
      capacity: typeof candidate.capacity === 'string' ? candidate.capacity : '',
      priority: typeof candidate.priority === 'string' ? candidate.priority : '',
    });
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 80) : '';
    const recommendation = typeof candidate.recommendation === 'string'
      ? candidate.recommendation.trim().slice(0, 160)
      : '';
    const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : '';
    const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '';
    if (!selection || !id || id.length > 160 || !recommendation || !createdAt || !updatedAt || seen.has(id)) return [];
    seen.add(id);
    return [{ ...selection, id, name: name || recommendation, recommendation, createdAt, updatedAt }];
  }).slice(0, 20);
}

export function validProjectSelection(
  value: Record<string, string>,
): ProjectSelection | null {
  const materials: ProjectMaterial[] = [
    'fresh',
    'protein',
    'packaged',
    'recycled',
    'plastics',
  ];
  const goals: ProjectGoal[] = [
    'sorting',
    'inspection',
    'weighing',
    'packing',
    'recycling',
    'materials',
  ];
  const capacities: ProjectCapacity[] = ['pilot', 'growing', 'high'];
  const priorities: ProjectPriority[] = [
    'quality',
    'throughput',
    'automation',
    'safety',
  ];
  if (
    !materials.includes(value.material as ProjectMaterial) ||
    !goals.includes(value.goal as ProjectGoal) ||
    !capacities.includes(value.capacity as ProjectCapacity) ||
    !priorities.includes(value.priority as ProjectPriority)
  )
    return null;
  return {
    material: value.material as ProjectMaterial,
    goal: value.goal as ProjectGoal,
    capacity: value.capacity as ProjectCapacity,
    priority: value.priority as ProjectPriority,
  };
}
