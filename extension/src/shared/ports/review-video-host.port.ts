export interface ValvePageCommitTransaction {
  rollback: () => void;
  finalize: () => void;
}

export interface ReviewVideoHost {
  element: HTMLDivElement;
  video: HTMLVideoElement;
}

export interface ReviewVideoHostPort {
  mount: () => ReviewVideoHost;
  dispose: () => void;
}
