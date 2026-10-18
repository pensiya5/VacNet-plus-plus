import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';

const nativePlayerStyles = readFileSync('src/features/valve-interop/components/native-player.css', 'utf8');
const style = document.createElement('style');
style.textContent = nativePlayerStyles;
document.head.append(style);

afterEach(() => {
  document.body.replaceChildren();
  document.body.className = '';
});

it('keeps the Plyr play button available while a native verdict is selected and playback is paused', () => {
  document.body.classList.add('vacnet-extension-root');
  const player = document.createElement('div');
  player.id = 'video';
  player.className = 'vacnet-native-player-active vjs-play-locked plyr--paused';
  const host = document.createElement('div');
  host.className = 'vacnet-review-player-host plyr';
  const play = document.createElement('button');
  play.type = 'button';
  play.setAttribute('data-plyr', 'play');
  host.append(play);
  player.append(host);
  document.body.append(player);

  expect(window.getComputedStyle(play).pointerEvents).not.toBe('none');
});
