import { describe, expect, it } from 'vitest';
import { pluginIdFromFilename, pluginNameFromFilename, uniquePluginId } from '../src/features/plugins/plugin-import.utils';

describe('plugin import derivation', () => {
  it('derives ids from filenames and keeps only valid characters', () => {
    expect(pluginIdFromFilename('ai-recommendations.js')).toBe('ai-recommendations');
    expect(pluginIdFromFilename('My Cool Plugin.JS')).toBe('my-cool-plugin');
    expect(pluginIdFromFilename('заметки к клипам.txt')).toBe('imported-plugin');
    expect(pluginIdFromFilename('a.js')).toBe('imported-plugin');
    expect(pluginIdFromFilename('--weird--name--.js')).toBe('weird-name');
    expect(pluginIdFromFilename('x'.repeat(100) + '.js').length).toBeLessThanOrEqual(64);
  });

  it('derives display names from filenames', () => {
    expect(pluginNameFromFilename('ai-recommendations.js')).toBe('ai recommendations');
    expect(pluginNameFromFilename('my_timer.ts')).toBe('my timer');
    expect(pluginNameFromFilename('.js')).toBe('Импортированный плагин');
  });

  it('uniquifies ids against taken ones and keeps the id length in bounds', () => {
    const taken = new Set(['review-timer', 'review-timer-2']);
    expect(uniquePluginId('review-timer', taken)).toBe('review-timer-3');
    expect(uniquePluginId('fresh', taken)).toBe('fresh');
    const longTaken = new Set(['x'.repeat(64)]);
    const next = uniquePluginId('x'.repeat(64), longTaken);
    expect(next.length).toBeLessThanOrEqual(64);
    expect(longTaken.has(next)).toBe(false);
  });
});
