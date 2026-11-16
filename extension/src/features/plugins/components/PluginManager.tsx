import { useEffect, useRef, useState } from 'preact/hooks';
import { PluginRecordSchema, PLUGIN_CODE_MAX_LENGTH, PLUGIN_LIMIT, type PluginRecord } from '../../../entities/plugin.entity';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import {
  PLUGIN_SETTINGS_KEY,
  getPluginData,
  pluginSettingsSchemasSignal,
  pluginStatusSignal,
  pluginsSignal,
  removePlugin,
  sandboxStateSignal,
  savePlugin,
  savePluginSettings,
  setPluginEnabled,
} from '../plugins.store';
import type { PluginSettingDefinition } from '../plugin-wire.port';
import { pluginIdFromFilename, pluginNameFromFilename, uniquePluginId } from '../plugin-import.utils';
import { DEMO_PLUGIN_CODE, DEMO_PLUGIN_ID, DEMO_PLUGIN_NAME, DEMO_PLUGIN_VERSION } from '../demo-plugin';
import styles from './PluginManager.module.css';

interface EditorState {
  id: string;
  name: string;
  version: string;
  code: string;
  isNew: boolean;
}

const randomPluginId = (): string => `plugin-${crypto.randomUUID().slice(0, 8)}`;

const describeSaveError = (error: unknown, t: ReturnType<typeof useTranslation>): string => {
  if (error instanceof RangeError) return t('pluginLimitReached', String(PLUGIN_LIMIT));
  const message = error instanceof Error ? error.message : String(error);
  return t('pluginSaveFailed', message);
};

const coerceSettingValue = (definition: PluginSettingDefinition, raw: unknown): unknown => {
  if (definition.type === 'toggle') return Boolean(raw);
  if (definition.type === 'number') {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return definition.default;
    const bounded = Math.min(Math.max(parsed, definition.min ?? -Number.MAX_SAFE_INTEGER), definition.max ?? Number.MAX_SAFE_INTEGER);
    return bounded;
  }
  const text = String(raw);
  if (definition.type === 'choice' && !definition.options?.includes(text)) return definition.default;
  return text;
};

/** Renders and persists one plugin's declared settings. */
const PluginSettingsForm = ({ pluginId, schema, onError }: { pluginId: string; schema: PluginSettingDefinition[]; onError: (error: unknown) => void }) => {
  const t = useTranslation();
  const [values, setValues] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let alive = true;
    void getPluginData(pluginId).then((data) => {
      if (!alive) return;
      const saved = data[PLUGIN_SETTINGS_KEY];
      const current: Record<string, unknown> = {};
      for (const definition of schema) {
        const savedValue = typeof saved === 'object' && saved !== null && !Array.isArray(saved)
          ? (saved as Record<string, unknown>)[definition.key]
          : undefined;
        current[definition.key] = savedValue !== undefined ? savedValue : definition.default;
      }
      setValues(current);
    }).catch((error: unknown) => { if (alive) { setValues({}); onError(error); } });
    return () => { alive = false; };
  }, [pluginId, schema, onError]);

  if (!values) return null;
  const update = (definition: PluginSettingDefinition, raw: unknown): void => {
    const next = { ...values, [definition.key]: coerceSettingValue(definition, raw) };
    setValues(next);
    void savePluginSettings(pluginId, next).catch(onError);
  };

  return (
    <div class={styles.settings}>
      <p class={styles.settingsTitle}>{t('pluginSettingsTitle')}</p>
      {schema.map((definition) => (
        <label class={styles.settingRow} key={definition.key}>
          {definition.type === 'toggle' ? (
            <input
              type="checkbox"
              class={styles.switch}
              checked={Boolean(values[definition.key])}
              onChange={(event) => update(definition, (event.target as HTMLInputElement).checked)}
            />
          ) : definition.type === 'choice' ? (
            <select
              value={String(values[definition.key] ?? '')}
              onChange={(event) => update(definition, (event.target as HTMLSelectElement).value)}
            >
              {(definition.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : definition.type === 'number' ? (
            <input
              type="number"
              value={Number(values[definition.key] ?? 0)}
              min={definition.min}
              max={definition.max}
              onBlur={(event) => update(definition, (event.target as HTMLInputElement).value)}
            />
          ) : (
            <input
              type="text"
              value={String(values[definition.key] ?? '')}
              onBlur={(event) => update(definition, (event.target as HTMLInputElement).value)}
            />
          )}
          <span>{definition.label}</span>
        </label>
      ))}
    </div>
  );
};

export const PluginManager = ({ onError }: { onError: (error: unknown) => void }) => {
  const t = useTranslation();
  const plugins = pluginsSignal.value.plugins;
  const statuses = pluginStatusSignal.value;
  const sandboxState = sandboxStateSignal.value;
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const orderedPlugins = Object.values(plugins)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const openNew = (): void => {
    setEditorError(null);
    setEditor({ id: randomPluginId(), name: '', version: '1.0.0', code: '', isNew: true });
  };

  const handleImportFile = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;
    if (file.size > PLUGIN_CODE_MAX_LENGTH) {
      onError(new RangeError(t('pluginImportTooLarge')));
      return;
    }
    const reader = new FileReader();
    reader.onload = (): void => {
      try {
        if (typeof reader.result !== 'string') throw new TypeError(t('pluginImportReadFailed'));
        const code = reader.result.trim();
        if (!code) throw new TypeError(t('pluginImportEmpty'));
        const taken = new Set(Object.keys(plugins));
        setEditorError(null);
        setEditor({
          id: uniquePluginId(pluginIdFromFilename(file.name), taken),
          name: pluginNameFromFilename(file.name),
          version: '1.0.0',
          code,
          isNew: true,
        });
      } catch (error) {
        onError(error);
      }
    };
    reader.onerror = (): void => onError(reader.error ?? new TypeError(t('pluginImportReadFailed')));
    reader.readAsText(file);
  };

  const openEdit = (plugin: PluginRecord): void => {
    setEditorError(null);
    setEditor({ id: plugin.id, name: plugin.name, version: plugin.version, code: plugin.code, isNew: false });
  };

  const openDemo = (): void => {
    setEditorError(null);
    setEditor({
      id: DEMO_PLUGIN_ID,
      name: DEMO_PLUGIN_NAME,
      version: DEMO_PLUGIN_VERSION,
      code: DEMO_PLUGIN_CODE,
      isNew: true,
    });
  };

  const saveEditor = async (): Promise<void> => {
    if (!editor) return;
    try {
      const id = editor.id.trim().toLowerCase();
      const existing = plugins[id];
      const record = PluginRecordSchema.parse({
        id,
        name: editor.name.trim(),
        version: editor.version.trim() || '1.0.0',
        code: editor.code,
        updatedAt: Date.now(),
        enabled: editor.isNew ? true : existing?.enabled ?? true,
      });
      await savePlugin(record);
      setEditor(null);
      setEditorError(null);
    } catch (error) {
      setEditorError(describeSaveError(error, t));
    }
  };

  const toggle = (plugin: PluginRecord, enabled: boolean): void => {
    void setPluginEnabled(plugin.id, enabled).catch(onError);
  };

  const remove = (pluginId: string): void => {
    if (armedDeleteId !== pluginId) {
      setArmedDeleteId(pluginId);
      return;
    }
    setArmedDeleteId(null);
    if (editor?.id === pluginId) setEditor(null);
    void removePlugin(pluginId).catch(onError);
  };

  return (
    <div class={styles.manager}>
      {sandboxState === 'unavailable' && <p class={styles.warning}>{t('pluginsSandboxUnavailable')}</p>}
      <p>{t('pluginsHint')}</p>
      <div class={styles.toolbar}>
        <button type="button" class={styles.primary} onClick={openNew}>{t('pluginNew')}</button>
        <button type="button" onClick={openDemo}>{t('pluginExample')}</button>
        <button
          type="button"
          aria-label={t('pluginImportLabel')}
          title={t('pluginImportHint')}
          onClick={() => importInputRef.current?.click()}
        >{t('pluginImportLabel')}</button>
        <input
          type="file"
          accept=".js,.txt,application/javascript,text/plain"
          class={styles.hidden}
          ref={importInputRef}
          onChange={handleImportFile}
        />
      </div>
      {editor && (
        <form
          class={styles.editor}
          onSubmit={(event) => { event.preventDefault(); void saveEditor(); }}
        >
          <div class={styles.fields}>
            <label>
              {t('pluginIdLabel')}
              <input
                value={editor.id}
                maxLength={64}
                spellcheck={false}
                onInput={(event) => setEditor({ ...editor, id: (event.target as HTMLInputElement).value })}
                required
              />
            </label>
            <label>
              {t('pluginNameLabel')}
              <input
                value={editor.name}
                maxLength={64}
                onInput={(event) => setEditor({ ...editor, name: (event.target as HTMLInputElement).value })}
                required
              />
            </label>
            <label>
              {t('pluginVersionLabel')}
              <input
                value={editor.version}
                maxLength={32}
                onInput={(event) => setEditor({ ...editor, version: (event.target as HTMLInputElement).value })}
              />
            </label>
          </div>
          <label>
            {t('pluginCodeLabel')}
            <textarea
              value={editor.code}
              spellcheck={false}
              onInput={(event) => setEditor({ ...editor, code: (event.target as HTMLTextAreaElement).value })}
              required
            />
          </label>
          {editorError && <p class={styles.editorError}>{editorError}</p>}
          <div class={styles.editorActions}>
            <button type="button" onClick={() => setEditor(null)}>{t('pluginCancel')}</button>
            <button type="submit" class={styles.primary}>{t('pluginSave')}</button>
          </div>
        </form>
      )}
      {orderedPlugins.length === 0 && !editor && <p>{t('pluginsEmpty')}</p>}
      {orderedPlugins.length > 0 && (
        <ul class={styles.list}>
          {orderedPlugins.map((plugin) => {
            const status = statuses[plugin.id];
            return (
              <li class={styles.card} key={plugin.id}>
                <input
                  type="checkbox"
                  class={styles.switch}
                  checked={plugin.enabled}
                  aria-label={t('pluginToggleLabel', plugin.name)}
                  onChange={(event) => toggle(plugin, (event.target as HTMLInputElement).checked)}
                />
                <div class={styles.cardInfo}>
                  <p class={styles.cardName}>
                    {plugin.name}
                    <small>v{plugin.version}</small>
                  </p>
                  <p class={styles.cardId}>{plugin.id}</p>
                  {status && (
                    <p class={`${styles.cardStatus} ${status.status === 'error' ? styles.error : undefined}`}>
                      {t(status.status === 'error' ? 'pluginStatusError' : 'pluginStatusRunning')}
                      {status.message ? `: ${status.message}` : ''}
                    </p>
                  )}
                  {(pluginSettingsSchemasSignal.value[plugin.id]?.length ?? 0) > 0 && (
                    <PluginSettingsForm
                      pluginId={plugin.id}
                      schema={pluginSettingsSchemasSignal.value[plugin.id] ?? []}
                      onError={onError}
                    />
                  )}
                </div>
                <div class={styles.cardActions}>
                  <button type="button" onClick={() => openEdit(plugin)}>{t('pluginEdit')}</button>
                  <button
                    type="button"
                    class={`${styles.danger} ${armedDeleteId === plugin.id ? styles.armed : undefined}`}
                    onClick={() => remove(plugin.id)}
                    onBlur={() => setArmedDeleteId(null)}
                  >
                    {armedDeleteId === plugin.id ? t('pluginDeleteConfirm') : t('pluginDelete')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
