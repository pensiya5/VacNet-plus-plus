import { z } from 'zod';
import { VerdictSelectionSchema } from './verdict.entity';

export const MAX_CUSTOM_PRESETS = 9 as const;
export const MAX_PRESET_LABEL_LENGTH = 10 as const;

export const presetAccentColors = [
  'green',
  'gold',
  'blue',
  'red',
  'purple',
  'cyan',
  'orange',
  'pink',
  'slate',
] as const;

export const PresetAccentColorSchema = z.enum(presetAccentColors);

export const CustomPresetSchema = z.strictObject({
  label: z.string().trim().min(1).max(MAX_PRESET_LABEL_LENGTH),
  color: PresetAccentColorSchema,
  verdicts: VerdictSelectionSchema,
  autoSubmit: z.boolean().default(false).catch(false),
});

export const CustomPresetsSchema = z.array(CustomPresetSchema)
  .max(MAX_CUSTOM_PRESETS)
  .superRefine((presets, context) => {
    const labels = new Set<string>();
    for (const [index, preset] of presets.entries()) {
      const normalizedLabel = preset.label.toLocaleLowerCase('en-US');
      if (labels.has(normalizedLabel)) {
        context.addIssue({
          code: 'custom',
          message: 'Preset labels must be unique ignoring case.',
          path: [index, 'label'],
        });
      }
      labels.add(normalizedLabel);
    }
  });

export type PresetAccentColor = z.infer<typeof PresetAccentColorSchema>;
export type CustomPreset = z.infer<typeof CustomPresetSchema>;
export const createDefaultCustomPresets = (): CustomPreset[] => [];