import { useEffect, useRef, useState } from 'preact/hooks';
import type { UpdateCheckResult } from '../update-checker.service';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import { Icon } from '../../../shared/components/Icon';
import styles from '../../../app/components/App.module.css';

export const UpdateCheckButton = ({ onCheck }: { onCheck: (force: boolean) => Promise<UpdateCheckResult> }) => {
  const t = useTranslation();
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);

  const check = async (force: boolean): Promise<void> => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const next = await onCheck(force);
      if (mounted.current) { setResult(next); setFailed(next.error); }
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void check(false);
    return () => { mounted.current = false; };
  }, [onCheck]);

  const available = result?.available === true;
  const label = available ? t('updateAvailable', result.latestVersion ?? '') : t('updatesTitle');
  return (
    <div class={`${styles.hoverDropdown} ${styles.updateDropdown}`}>
      <button type="button" class={available ? styles.updateAvailable : undefined}
        aria-label={label} title={label} data-update-available={available ? '' : undefined}>
        <Icon name={available ? 'download' : 'refresh'} />
        {available && <span class={styles.updateDot} />}
      </button>
      <div class={`${styles.dropdownContent} ${styles.updateContent}`}>
        <strong>{t('updatesTitle')}</strong>
        {result && <p class={styles.updateVersion}>{t('updateInstalled', result.currentVersion)}</p>}
        <p role="status" aria-live="polite">
          {busy ? t('updateChecking') : available ? label : failed ? t('updateCheckFailed') : t('updateCurrent')}
        </p>
        {!busy && available && failed && <p class={styles.updateVersion}>{t('updateCheckFailed')}</p>}
        <div class={styles.updateActions}>
          <button type="button" data-update-check disabled={busy} onClick={() => { void check(true); }}>
            {t('updateCheckNow')}
          </button>
          {available && result.releaseUrl && <a href={result.releaseUrl} target="_blank" rel="noopener noreferrer">{t('updateOpenRelease')}</a>}
        </div>
      </div>
    </div>
  );
};
