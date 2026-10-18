import { z } from 'zod';

export const ThemeSchema = z.enum(['light', 'dark', 'system']).catch('dark');

export type Theme = z.infer<typeof ThemeSchema>;
export type ResolvedTheme = Exclude<Theme, 'system'>;
