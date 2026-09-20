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
    id: draft.id,
    name: draft.name,
    recommendation: draft.recommendation,
    material: draft.material,
    goal: draft.goal,
    capacity: draft.capacity,
    priority: draft.priority,
  });
  return `${locale === 'en' ? '/en/project' : '/project'}?${params.toString()}`;
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
