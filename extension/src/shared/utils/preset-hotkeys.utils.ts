import type { ReviewCommand } from '../ports/protocol.port';
import type { CustomPreset } from '../../entities/preset.entity';

const PRESET_CODE_PATTERN = /^(?:Digit|Numpad)([1-9])$/u;

export const presetIndexFromCode = (code: string): number | null => {
  const match = PRESET_CODE_PATTERN.exec(code);
  if (!match?.[1]) return null;
  return Number(match[1]) - 1;
};

export const createPresetCommand = (
  preset: CustomPreset,
): ReviewCommand => preset.autoSubmit
  ? { type: 'submit', verdicts: { ...preset.verdicts }, badClip: false }
  : { type: 'set-verdicts', verdicts: { ...preset.verdicts } };
