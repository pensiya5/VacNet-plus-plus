import type { ClipData } from '../entities/clip.entity';
import type { VerdictSelection } from '../entities/verdict.entity';
import type { ParsedValvePage } from '../features/valve-interop/clip.parser';
import type { ValveSubmitRequest } from '../features/valve-interop/adapters/verdict-form.adapter';
import type { ValvePageCommitTransaction } from '../shared/ports/review-video-host.port';

export interface SubmitRequestFactory {
  create: (command: SubmitCommand, signal: AbortSignal) => ValveSubmitRequest;
}

export interface ValvePageClient {
  submit: (request: ValveSubmitRequest) => Promise<ValveResponse>;
}

export interface ValveResponse {
  url: string;
  text: () => Promise<string>;
  contentType: string;
}

export interface NextPageReader {
  read: (html: string, baseUrl: string) => Promise<ParsedValvePage>;
}

export interface ValvePageCommitter {
  validate: (page: ParsedValvePage) => void;
  commit: (page: ParsedValvePage) => ValvePageCommitTransaction;
}

export interface HistoryPersistencePort {
  save: (params: { clip: ClipData; verdicts: VerdictSelection; badClip: boolean }) => Promise<void>;
}

export interface PageNavigator {
  replace: (url: string) => void;
}

export interface ClipActivationPort {
  activate: (page: ParsedValvePage) => void;
}

export interface PlayerTransitionPort {
  transition: (clip: ClipData) => Promise<void>;
}

export interface SubmitCommand {
  verdicts: VerdictSelection;
  badClip: boolean;
}
