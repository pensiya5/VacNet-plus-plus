import { z } from 'zod';
import { LATEST_RELEASE_API, REPOSITORY_URL } from '../../shared/project-info';

const RELEASES_URL = `${REPOSITORY_URL}/releases`;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MANUAL_INTERVAL = 60 * 1000;

const parseVersion = (version: string): number[] | null => {
  if (!/^v?(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/u.test(version)) return null;
  const parts = version.replace(/^v/u, '').split('.').map(Number);
  return parts.every((part) => Number.isSafeInteger(part) && part <= 65535) ? parts : null;
};

export const isNewerVersion = (latest: string, current: string): boolean => {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  if (!latestParts || !currentParts) return false;
  for (let index = 0; index < Math.max(latestParts.length, currentParts.length); index += 1) {
    const difference = (latestParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
};

const VersionTagSchema = z.string().refine((value) => parseVersion(value) !== null);
const TimestampSchema = z.number().int().nonnegative();
const CacheSchema = z.object({
  attemptedAt: TimestampSchema,
  checkedAt: TimestampSchema.nullable(),
  cooldownUntil: TimestampSchema,
  latestTag: VersionTagSchema.nullable(),
  error: z.boolean(),
}).refine((value) => value.error || (value.latestTag !== null && value.checkedAt !== null));
type UpdateCache = z.infer<typeof CacheSchema>;
const ReleaseSchema = z.object({ tag_name: VersionTagSchema, draft: z.literal(false), prerelease: z.literal(false) });
export const UpdateCheckRequestSchema = z.object({ force: z.boolean() }).strict();

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  available: boolean;
  releaseUrl: string | null;
  checkedAt: number | null;
  error: boolean;
}

interface UpdateCheckerOptions {
  currentVersion: string;
  storage: { getValue: () => Promise<unknown>; setValue: (value: UpdateCache) => Promise<unknown> };
  fetch?: typeof fetch;
  now?: () => number;
}

// All tabs ask the background worker, so cache writes and HTTP requests have one owner.
export class UpdateChecker {
  private cache: UpdateCache | null = null;
  private loaded = false;
  private inFlight: Promise<UpdateCheckResult> | null = null;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: UpdateCheckerOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
    this.now = options.now ?? Date.now;
  }

  check(force = false): Promise<UpdateCheckResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.performCheck(force).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private result(cache: UpdateCache): UpdateCheckResult {
    return {
      currentVersion: this.options.currentVersion,
      latestVersion: cache.latestTag?.replace(/^v/u, '') ?? null,
      available: cache.latestTag !== null && isNewerVersion(cache.latestTag, this.options.currentVersion),
      releaseUrl: cache.latestTag ? `${RELEASES_URL}/tag/${encodeURIComponent(cache.latestTag)}` : null,
      checkedAt: cache.checkedAt,
      error: cache.error,
    };
  }

  private async performCheck(force: boolean): Promise<UpdateCheckResult> {
    if (!this.loaded) {
      try {
        const parsed = CacheSchema.safeParse(await this.options.storage.getValue());
        if (parsed.success) this.cache = parsed.data;
      } catch { /* A storage failure must not prevent checking. */ }
      this.loaded = true;
    }
    const now = this.now();
    // A clock correction must not keep a daily check cached indefinitely.
    if (this.cache && this.cache.attemptedAt > now) this.cache = null;
    const previous = this.cache;
    const interval = force ? MANUAL_INTERVAL : previous?.error ? HOUR : DAY;
    if (previous && (now < previous.cooldownUntil || now - previous.attemptedAt < interval)) {
      return this.result(previous);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let next: UpdateCache = {
      attemptedAt: now, checkedAt: previous?.checkedAt ?? null, latestTag: previous?.latestTag ?? null,
      cooldownUntil: 0, error: true,
    };
    try {
      const response = await this.fetcher(LATEST_RELEASE_API, {
        method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
        signal: controller.signal,
      });
      if (response.status === 403 || response.status === 429) {
        const retryHeader = response.headers.get('retry-after');
        const retrySeconds = retryHeader === null ? NaN : Number(retryHeader);
        const retryDate = retryHeader === null ? NaN : Date.parse(retryHeader);
        const resetHeader = response.headers.get('x-ratelimit-reset');
        const resetAt = resetHeader === null ? 0 : Number(resetHeader) * 1000;
        const retryAt = Number.isFinite(retrySeconds) ? now + Math.max(0, retrySeconds) * 1000 : retryDate;
        next.cooldownUntil = Math.max(now + HOUR, Number.isFinite(retryAt) ? retryAt : 0, Number.isFinite(resetAt) ? resetAt : 0);
      }
      if (!response.ok) throw new Error(`Release check failed: ${response.status}`);
      const release = ReleaseSchema.parse(await response.json());
      next = { attemptedAt: now, checkedAt: now, latestTag: release.tag_name, cooldownUntil: 0, error: false };
    } catch { /* Return a failure state while preserving a previously discovered release. */ }
    finally { clearTimeout(timeout); }
    this.cache = next;
    try { await this.options.storage.setValue(next); } catch { /* Keep the in-memory cache if storage is full. */ }
    return this.result(next);
  }
}
