import type {
  CanonicalSource,
  TranslationJob,
  TranslationJobItem,
  TranslationRecord,
} from './translation-types';

export type TranslationResource = {
  source: CanonicalSource;
  translation: TranslationRecord | null;
  public: boolean;
  reviewed: boolean;
};
export type TranslationSummary = {
  total: number;
  missing: number;
  needsReview: number;
  published: number;
  draft: number;
  outdated: number;
};
export type AdminJobItem = Omit<
  TranslationJobItem,
  'claimToken' | 'sourcePayload'
>;
export type AdminTranslationJob = TranslationJob & {
  progress: Record<TranslationJobItem['state'] | 'total', number>;
};
export type TranslationListing = {
  resources: TranslationResource[];
  total: number;
  limit: number;
  offset: number;
  summary: TranslationSummary;
  jobs: AdminTranslationJob[];
  items: AdminJobItem[];
};
export function translationStateLabel(resource: TranslationResource) {
  if (!resource.translation) return '尚未翻譯';
  if (resource.translation.status === 'draft') return '草稿・未公開';
  if (resource.translation.status === 'needs_review')
    return resource.public ? '公開・待人工審核' : '未公開・待人工審核';
  return resource.public ? '已發布・已審核' : '來源未發布・已審核';
}
