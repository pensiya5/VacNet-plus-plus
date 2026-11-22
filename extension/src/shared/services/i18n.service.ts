import { z } from 'zod';
import germanMessages from '../../../public/_locales/de/messages.json';
import englishMessages from '../../../public/_locales/en/messages.json';
import spanishMessages from '../../../public/_locales/es/messages.json';
import portugueseMessages from '../../../public/_locales/pt_BR/messages.json';
import russianMessages from '../../../public/_locales/ru/messages.json';
import chineseMessages from '../../../public/_locales/zh_CN/messages.json';
import { messageKeys, type MessageKey } from '../utils/generated-message-keys.utils';

export { messageKeys, type MessageKey } from '../utils/generated-message-keys.utils';

const catalogs = {
  de: germanMessages,
  en: englishMessages,
  es: spanishMessages,
  'pt-BR': portugueseMessages,
  ru: russianMessages,
  'zh-CN': chineseMessages,
} satisfies Record<string, Record<MessageKey, { message: string }>>;

type Locale = keyof typeof catalogs;

// navigator.language is available in both the isolated and page worlds.
const getLocale = (): Locale => {
  const [language, ...subtags] = (globalThis.navigator?.language ?? '').toLowerCase().split('-');
  switch (language) {
    case 'de':
    case 'es':
    case 'ru':
      return language;
    case 'pt':
      return 'pt-BR';
    case 'zh':
      if (subtags[0] === 'hans') return 'zh-CN';
      return subtags.some((tag) => ['hant', 'hk', 'mo', 'tw'].includes(tag)) ? 'en' : 'zh-CN';
    default:
      return 'en';
  }
};

const catalogShape = Object.fromEntries(
  messageKeys.map((key) => [key, z.string().min(1)]),
) as Record<MessageKey, z.ZodString>;

export const MessageCatalogSchema = z.strictObject({
  ...catalogShape,
  videoJsLocale: z.enum(['de', 'en', 'es', 'pt-BR', 'ru', 'zh-CN']),
});

export type MessageCatalog = z.infer<typeof MessageCatalogSchema>;

export type Translate = (key: MessageKey, substitutions?: string | string[]) => string;

export const getMessage: Translate = (key, substitutions) => {
  const message = catalogs[getLocale()][key]?.message;
  if (!message) throw new Error(`Missing browser translation: ${key}`);
  if (substitutions === undefined) return message;
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  let index = 0;
  return message.replace(/\{[^{}]+\}/gu, (placeholder) => values[index++] ?? placeholder);
};

export const createCatalog = (): MessageCatalog => {
  const locale = getLocale();
  const messages = catalogs[locale];
  return MessageCatalogSchema.parse({
    ...Object.fromEntries(messageKeys.map((key) => [key, messages[key].message])),
    videoJsLocale: locale,
  });
};
