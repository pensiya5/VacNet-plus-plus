import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import { Icon } from '../../../shared/components/Icon';
import { ABORT_ERROR_MESSAGE } from '../../../shared/utils/message-bus-wire.utils';
import styles from './Dashboard.module.css';
import type { DashboardMode } from '../dashboard.store';

const MAX_HISTORY_FILE_BYTES = 10 * 1024 * 1024;

const readFileText = (result: string | ArrayBuffer | null, invalidMessage: string): string => {
  if (typeof result !== 'string') throw new TypeError(invalidMessage);
  return result;
};

interface DashboardProps {
  onClearHistory: () => void;
  onClose: () => void;
  onCopyMetrics: () => void;
  history: ComponentChildren;
  metrics: ComponentChildren;
  statistics?: ComponentChildren;
  mode: DashboardMode | null;
  onImportHistory: (data: unknown) => void;
  onExportHistory: () => void;
  onImportError: (error: unknown) => void;
}

export const Dashboard = ({ history, metrics, statistics, mode, onClearHistory, onClose, onCopyMetrics, onImportHistory, onExportHistory, onImportError }: DashboardProps) => {
  const t = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  useEffect(() => {
    setIsConfirming(false);
    if (!mode) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previouslyFocusedRef.current?.focus();
  }, [mode]);
  useEffect(() => {
    if (isConfirming) dialogRef.current?.querySelector<HTMLElement>('[data-confirm-dialog] button')?.focus();
  }, [isConfirming]);
  useEffect(() => {
    if (!isConfirming) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); setIsConfirming(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isConfirming]);
  if (!mode) return null;
  const isHistory = mode === 'history';
  const className = isHistory ? `${styles.dashboard} ${styles.history}` : styles.dashboard;
  const handleUpload = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    const file = target.files?.[0];
    if (!file) return;
    target.value = '';
    if (file.size > MAX_HISTORY_FILE_BYTES) {
      onImportError(new RangeError(t('errHistoryFileTooLarge')));
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvent): void => {
      try {
         const data: unknown = JSON.parse(readFileText(loadEvent.target?.result ?? null, t('errHistoryFileNotUtf8')));
        onImportHistory(data);
      } catch (error) {
        onImportError(error);
      }
    };
    reader.onerror = (): void => {
      onImportError(reader.error ?? new Error(t('errHistoryFileReadFailed')));
    };
    reader.onabort = (): void => {
      onImportError(new DOMException(ABORT_ERROR_MESSAGE, 'AbortError'));
    };
    reader.readAsText(file);
  };

  return (
    <aside
      class={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vacnet-dashboard-title"
      tabIndex={-1}
      ref={dialogRef}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !isConfirming) return;
        event.preventDefault();
        event.stopPropagation();
        setIsConfirming(false);
      }}
    >
      <header>
        <h2 id="vacnet-dashboard-title">{isHistory ? t('historyLogTitle') : mode === 'statistics' ? t('statisticsTitle') : t('devMetricsTitle')}</h2>
        <div class={styles.actions}>
          {isHistory && (
            <>
              <input
                type="file"
                accept=".json,application/json"
                class={styles.hidden}
                ref={fileInputRef}
                onChange={handleUpload}
              />
              <button
                type="button"
                class={styles.action}
                aria-label={t('uploadVideoHistory')}
                title={t('uploadVideoHistoryHint')}
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="upload" />
              </button>
              <button
                type="button"
                class={styles.action}
              aria-label={t('downloadVideoHistory')}
              title={t('downloadVideoHistoryHint')}
              onClick={onExportHistory}
            >
              <Icon name="download" />
            </button>
            </>
          )}
          {mode !== 'statistics' && <button
            type="button"
            class={styles.action}
            aria-label={isHistory ? t('clearVideoHistory') : t('copyMetrics')}
            title={isHistory ? t('clearVideoHistoryHint') : t('copyMetricsHint')}
             onClick={isHistory ? () => setIsConfirming(true) : onCopyMetrics}
           >
             <Icon name={isHistory ? 'trash' : 'copy'} />
           </button>}
           <button type="button" class={styles.close} aria-label={t('closeDashboard')} onClick={onClose}><Icon name="close" /></button>
        </div>
      </header>
      <div class={styles.content}>
         {isHistory ? history : mode === 'statistics' ? statistics : metrics}
       </div>
       {isConfirming && (
         <div class={styles.confirmOverlay} role="presentation">
           <div class={styles.confirmDialog} data-confirm-dialog role="alertdialog" aria-modal="true" aria-labelledby="vacnet-confirm-title" aria-describedby="vacnet-confirm-message">
             <h3 id="vacnet-confirm-title">{t('clearVideoHistory')}</h3>
             <p id="vacnet-confirm-message">{t('confirmClearHistory')}</p>
             <div class={styles.confirmActions}>
               <button type="button" onClick={() => setIsConfirming(false)}>{t('closeDashboard')}</button>
               <button type="button" onClick={() => { setIsConfirming(false); onClearHistory(); }}>{t('clearVideoHistory')}</button>
             </div>
           </div>
         </div>
       )}
    </aside>
  );
};
