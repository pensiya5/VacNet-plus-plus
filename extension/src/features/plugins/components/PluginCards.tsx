import { pluginActionDispatchSignal, pluginCardsSignal } from '../plugins.store';
import { MetricSection } from '../../../shared/components/MetricSection';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import styles from './PluginCards.module.css';

export type PluginCardSlot = 'metrics' | 'review';

const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** One probability row: label + track/fill + percentage. */
const Bar = ({ label, value }: { label: string; value: number }) => {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div class={styles.bar}>
      <span class={styles.barLabel}>{label}</span>
      <span class={styles.barTrack}>
        <span class={styles.barFill} style={`width: ${Math.round(clamped * 100)}%`} />
      </span>
      <span class={styles.barValue}>{percent(clamped)}</span>
    </div>
  );
};

/**
 * Cards set by plugins through `vacnet.ui.setCard`.
 * The review slot renders as a panel matching the verdict panel styling;
 * the metrics slot keeps the compact section look.
 */
export const PluginCards = ({ slot }: { slot: PluginCardSlot }) => {
  const t = useTranslation();
  const cards = Object.entries(pluginCardsSignal.value)
    .map(([id, scoped]) => [id, scoped[slot]] as const)
    .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => Boolean(entry[1]));

  if (cards.length === 0) return null;

  if (slot === 'metrics') {
    return (
      <>
        {cards.map(([id, card]) => (
          <MetricSection
            key={id}
            title={card.title}
            entries={[{ key: id, label: t('pluginCardLabel'), value: card.text }]}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {cards.map(([id, card]) => (
        <section class={styles.panel} key={id}>
          <h3 class={styles.panelTitle}>{card.title}</h3>
          {card.progress && (
            <div class={styles.progressBlock}>
              <div class={styles.progressTrack}>
                <div
                  class={`${styles.progressFill} ${card.progress.value >= 1 ? styles.progressDone : undefined}`}
                  style={`width: ${Math.round(Math.max(0, Math.min(1, card.progress.value)) * 100)}%`}
                />
              </div>
              {card.progress.label && <p class={styles.stageLabel}>{card.progress.label}</p>}
            </div>
          )}
          {card.bars && card.bars.length > 0 && (
            <div class={styles.bars}>
              {card.bars.map((bar) => <Bar key={bar.label} label={bar.label} value={bar.value} />)}
            </div>
          )}
          {card.text && <p class={styles.panelText}>{card.text}</p>}
          {card.actions && card.actions.length > 0 && (
            <div class={styles.actions}>
              {card.actions.map((action) => (
                <button
                  type="button"
                  key={action.key}
                  onClick={() => pluginActionDispatchSignal.value?.(id, action.key)}
                >{action.label}</button>
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
};
