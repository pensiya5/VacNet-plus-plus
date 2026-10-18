export interface VideoJsPlayer {
  id(): string;
  el(): HTMLElement;
  currentTime(): number;
  currentTime(value: number): void;
  duration(): number;
  pause(): void;
  play(): Promise<void> | void;
  paused(): boolean;
  playbackRate(): number;
  playbackRate(value: number): void;
  preload(value: string): void;
  src(source: { src: string; type: string }): void;
  volume(): number;
  volume(value: number): void;
  muted(): boolean;
  muted(value: boolean): void;
  language(): string;
  language(value: string): void;
  on(type: string, listener: () => void): void;
  off(type: string, listener: () => void): void;
}
