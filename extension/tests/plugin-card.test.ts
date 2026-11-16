import { describe, expect, it } from 'vitest';
import { PluginCardSchema } from '../src/features/plugins/plugin-wire.port';

describe('plugin card schema', () => {
  it('accepts a full card with bars, actions and progress', () => {
    const card = PluginCardSchema.parse({
      title: 'ИИ-рекомендация',
      text: 'Похоже на wallhack',
      slot: 'review',
      bars: [{ label: 'aimassist', value: 0.29 }, { label: 'wallhack', value: 0.73 }],
      actions: [{ key: 'analyze', label: 'Перепроверить' }],
      progress: { value: 0.4, label: 'Скачиваю клип: 12 МБ' },
    });
    expect(card.bars).toHaveLength(2);
    expect(card.actions?.[0]?.key).toBe('analyze');
    expect(card.progress?.value).toBe(0.4);
  });

  it('defaults the slot to metrics and tolerates absent extras', () => {
    const card = PluginCardSchema.parse({ title: 'Таймер', text: '00:42' });
    expect(card.slot).toBe('metrics');
    expect(card.bars).toBeUndefined();
    expect(card.actions).toBeUndefined();
    expect(card.progress).toBeUndefined();
  });

  it('rejects out-of-range values and malformed action keys', () => {
    expect(() => PluginCardSchema.parse({
      title: 'x', text: '', bars: [{ label: 'aimassist', value: 1.5 }],
    })).toThrow();
    expect(() => PluginCardSchema.parse({
      title: 'x', text: '', actions: [{ key: 'Bad Key!', label: 'ok' }],
    })).toThrow();
    expect(() => PluginCardSchema.parse({
      title: 'x', text: '', progress: { value: -0.1 },
    })).toThrow();
  });

  it('caps bars and actions counts', () => {
    const bars = Array.from({ length: 9 }, (_, i) => ({ label: `l${i}`, value: 0.1 }));
    const actions = Array.from({ length: 4 }, (_, i) => ({ key: `k${i}`, label: `b${i}` }));
    expect(() => PluginCardSchema.parse({ title: 'x', text: '', bars })).toThrow();
    expect(() => PluginCardSchema.parse({ title: 'x', text: '', actions })).toThrow();
  });
});
