import type { AdminIdentity } from './admin-auth';
import {
  GroqTranslationError,
  translateWithGroq,
  type GroqTranslationOptions,
} from './groq-translation';
import {
  claimTranslationJobItem,
  finishTranslationJobItem,
  getCanonicalSource,
  getTranslation,
  listTranslationJobItems,
  saveTranslation,
} from './translation-repository';
import type { TranslationItemState } from './translation-types';

export type ProcessTranslationJobItemOptions = GroqTranslationOptions & {
  db: D1Database;
  jobId: string;
  actor: AdminIdentity;
};

export type ProcessTranslationJobItemResult = {
  state:
    | Extract<TranslationItemState, 'succeeded' | 'failed' | 'skipped'>
    | 'idle';
  itemId?: string;
  resourceId?: string;
  failureReason?: string;
  reason?: 'human_translation_protected' | 'source_outdated';
};

function safeFailureReason(error: unknown) {
  return error instanceof GroqTranslationError
    ? error.code
    : 'translation_persistence_failed';
}

function hasExpiredLease(leaseExpiresAt: string | null) {
  return !!leaseExpiresAt && Date.parse(leaseExpiresAt) <= Date.now();
}

/** Processes one pending or expired item so an administrator can poll a bounded job. */
export async function processNextTranslationJobItem({
  db,
  jobId,
  actor,
  ...groq
}: ProcessTranslationJobItemOptions): Promise<ProcessTranslationJobItemResult> {
  const item = (await listTranslationJobItems(db, jobId)).find(
    (candidate) =>
      candidate.state === 'pending' ||
      (candidate.state === 'running' &&
        hasExpiredLease(candidate.leaseExpiresAt)),
  );
  if (!item) return { state: 'idle' };
  const claimed = await claimTranslationJobItem(db, item.id, { actor });
  if (!claimed) return { state: 'idle' };
  const result = {
    itemId: claimed.id,
    resourceId: claimed.resourceId,
  };
  try {
    const source = await getCanonicalSource(
      db,
      claimed.resourceType,
      claimed.resourceId,
    );
    if (
      !source ||
      source.status !== 'published' ||
      source.sourceVersion !== claimed.sourceVersion
    ) {
      await finishTranslationJobItem(
        db,
        claimed.id,
        claimed.claimToken!,
        {
          state: 'skipped',
        },
        actor,
      );
      return { ...result, state: 'skipped', reason: 'source_outdated' };
    }
    const existing = await getTranslation(
      db,
      claimed.resourceType,
      claimed.resourceId,
    );
    if (existing?.origin === 'human') {
      await finishTranslationJobItem(
        db,
        claimed.id,
        claimed.claimToken!,
        {
          state: 'skipped',
        },
        actor,
      );
      return {
        ...result,
        state: 'skipped',
        reason: 'human_translation_protected',
      };
    }
    const payload = await translateWithGroq(source, groq);
    await saveTranslation(
      db,
      {
        ...source,
        payload,
        origin: 'ai',
        status: 'needs_review',
        claim: { itemId: claimed.id, token: claimed.claimToken! },
      },
      actor,
    );
    await finishTranslationJobItem(
      db,
      claimed.id,
      claimed.claimToken!,
      {
        state: 'succeeded',
      },
      actor,
    );
    return { ...result, state: 'succeeded' };
  } catch (error) {
    const failureReason = safeFailureReason(error);
    await finishTranslationJobItem(
      db,
      claimed.id,
      claimed.claimToken!,
      {
        state: 'failed',
        failureReason,
      },
      actor,
    );
    return { ...result, state: 'failed', failureReason };
  }
}
