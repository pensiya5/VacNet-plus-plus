import { useEffect } from 'preact/hooks';
import { playerOverlaySignal, hideSpeedOverlay } from '../player/player-overlays.store';
import styles from './PlayerOverlays.module.css';

export const PlayerOverlays = () => {
  const state = playerOverlaySignal.value;
  useEffect(() => {
    if (!state.speed.visible) return;
    const timer = window.setTimeout(hideSpeedOverlay, 1000);
    return () => window.clearTimeout(timer);
  }, [state.speed.text, state.speed.visible]);
  return <>
    {state.speed.visible && <div class={styles.speed}>{state.speed.text}</div>}
    {state.trigger.phase !== 'hidden' && (
      <div class={`${styles.trigger} ${styles[state.trigger.phase]}`}>{state.trigger.text}</div>
    )}
  </>;
};
