import { afterEach, expect, it, vi } from 'vitest';
import { UpdateChecker, isNewerVersion } from '../src/features/updates/update-checker.service';

const release = (tag = 'v4.3.0') => new Response(JSON.stringify({
  tag_name: tag, draft: false, prerelease: false,
  html_url: 'https://untrusted.example/download',
}), { status: 200 });
const setup = (version = '4.2.1') => {
  let now = 1_800_000_000_000;
  let saved: unknown = null;
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(release());
  const storage = {
    getValue: async () => saved,
    setValue: async (value: unknown) => { saved = structuredClone(value); },
  };
  const create = (currentVersion = version) => new UpdateChecker({
    currentVersion, storage, fetch: fetcher, now: () => now,
  });
  return { checker: create(), create, fetcher, storage, advance: (ms: number) => { now += ms; } };
};
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('calls the browser fetch with its global receiver instead of the checker instance', async () => {
  vi.stubGlobal('fetch', function (this: unknown) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(release());
  });
  const { storage } = setup();
  const checker = new UpdateChecker({ currentVersion: '4.2.1', storage });
  expect(await checker.check()).toMatchObject({ error: false, available: true, latestVersion: '4.3.0' });
});

it('compares numeric versions including different segment counts, without prerelease guesses', () => {
  expect(isNewerVersion('v4.10.0', '4.9.9')).toBe(true);
  expect(isNewerVersion('4.2.1.1', '4.2.1')).toBe(true);
  expect(isNewerVersion('4.2.1', '4.2.1.0')).toBe(false);
  expect(isNewerVersion('4.1.9', '4.2.1')).toBe(false);
  expect(isNewerVersion('v4.3.0-beta', '4.2.1')).toBe(false);
  expect(isNewerVersion('garbage', '4.2.1')).toBe(false);
});

it('checks only the fork and builds the release link from its validated tag', async () => {
  const { checker, fetcher } = setup();
  const result = await checker.check();
  expect(result).toMatchObject({ currentVersion: '4.2.1', latestVersion: '4.3.0', available: true,
    releaseUrl: 'https://github.com/pensiya5/VacNetPlusPlus/releases/tag/v4.3.0', error: false });
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.github.com/repos/pensiya5/VacNetPlusPlus/releases/latest');
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
});

it('persists the daily cache across worker restarts and rechecks after a day', async () => {
  const { checker, create, fetcher, advance } = setup();
  await checker.check();
  advance(23 * 60 * 60 * 1000);
  expect((await create().check()).available).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  advance(60 * 60 * 1000);
  await create().check();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('manual checks bypass the daily cache but limit rapid clicks', async () => {
  const { checker, fetcher, advance } = setup();
  await checker.check();
  await checker.check(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  advance(60_000);
  fetcher.mockResolvedValue(release('v4.4.0'));
  expect((await checker.check(true)).latestVersion).toBe('4.4.0');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('shares a single request between simultaneous tabs', async () => {
  const { checker, fetcher } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const first = checker.check();
  const second = checker.check(true);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  resolve(release());
  expect(await second).toEqual(await first);
});

it('reports errors without hiding a known update and retries automatic failures after an hour', async () => {
  const { checker, fetcher, advance } = setup();
  const good = await checker.check();
  advance(60_000);
  fetcher.mockRejectedValue(new Error('offline'));
  const failed = await checker.check(true);
  expect(failed).toMatchObject({ available: true, latestVersion: '4.3.0', error: true, checkedAt: good.checkedAt });
  advance(59 * 60_000);
  await checker.check();
  expect(fetcher).toHaveBeenCalledTimes(2);
  advance(60_000);
  fetcher.mockResolvedValue(release('v4.4.0'));
  expect((await checker.check()).error).toBe(false);
});

it('does not call an offline or invalid response an up-to-date installation', async () => {
  const { checker, fetcher } = setup();
  fetcher.mockResolvedValue(new Response('{}', { status: 500 }));
  expect(await checker.check()).toMatchObject({ error: true, latestVersion: null, available: false, checkedAt: null });
  for (const body of [
    { tag_name: 'v4.3.0-beta', draft: false, prerelease: true },
    { tag_name: '../other', draft: false, prerelease: false },
    { tag_name: 'v4.3.0', draft: true, prerelease: false },
  ]) {
    const state = setup();
    state.fetcher.mockResolvedValue(new Response(JSON.stringify(body)));
    expect((await state.checker.check()).error).toBe(true);
  }
});

it('respects GitHub cooldown even for manual checks', async () => {
  const { checker, fetcher, advance } = setup();
  fetcher.mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '7200' } }));
  await checker.check();
  advance(60 * 60_000);
  await checker.check(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  advance(60 * 60_000);
  fetcher.mockResolvedValue(release());
  expect((await checker.check(true)).available).toBe(true);
});

it('compares cached releases with the installed version after upgrading', async () => {
  const { checker, create, fetcher } = setup();
  await checker.check();
  expect(await create('4.3.0').check()).toMatchObject({ available: false, error: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('ignores corrupt cache and keeps checking when local storage is unavailable', async () => {
  const { checker, storage } = setup();
  storage.getValue = async () => ({ attemptedAt: 'wrong', tag: 'evil' });
  storage.setValue = async () => { throw new Error('quota'); };
  expect(await checker.check()).toMatchObject({ available: true, error: false });
});

it('times out hung requests and returns an error', async () => {
  vi.useFakeTimers();
  const { checker, fetcher } = setup();
  fetcher.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const pending = checker.check();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await pending).toMatchObject({ error: true, latestVersion: null });
});
