import type { RemoteFailure, ToMainWireMessage, FromMainWireMessage, HistoryFindParams, HistorySaveParams, WebmMetadata, WebmMetadataReadParams } from '../ports/protocol.port';
import type { HistoryLookup } from '../../entities/history.entity';
import { MessageBusError, type RequestMethod } from '../ports/message-bus.port';

export const REQUEST_TIMEOUT_MS = 5_000;
export const ABORT_ERROR_MESSAGE = '';

export const IPC = {
  postMessageKey: 'vacnet:message-bus',
  channels: {
    toMain: 'to-main',
    fromMain: 'from-main',
  },
} as const;

type IpcChannel = typeof IPC.channels[keyof typeof IPC.channels];
type IpcMessage<C extends IpcChannel> = C extends typeof IPC.channels.toMain
  ? ToMainWireMessage
  : FromMainWireMessage;

type PostMessagePayload<C extends IpcChannel> = {
  channel: C;
  message: IpcMessage<C>;
};

export const dispatch = <C extends IpcChannel>(channel: C, message: IpcMessage<C>): void => {
  const payload: PostMessagePayload<C> = { channel, message };
  window.postMessage({ [IPC.postMessageKey]: payload }, window.location.origin);
};

export const dispatchToMain = (message: ToMainWireMessage): void => dispatch(IPC.channels.toMain, message);
export const dispatchToIsolated = (message: FromMainWireMessage): void => dispatch(IPC.channels.fromMain, message);

export const dispatchHistoryFindRequest = (id: string, params: HistoryFindParams): void =>
  dispatch(IPC.channels.fromMain, { kind: 'request', id, method: 'history.find', params });

export const dispatchHistorySaveRequest = (id: string, params: HistorySaveParams): void =>
  dispatch(IPC.channels.fromMain, { kind: 'request', id, method: 'history.save', params });

export const dispatchWebmMetadataRequest = (id: string, params: WebmMetadataReadParams): void =>
  dispatch(IPC.channels.fromMain, { kind: 'request', id, method: 'webm-metadata.read', params });

export const dispatchHistoryFindResponse = (id: string, value: HistoryLookup): void =>
  dispatch(IPC.channels.toMain, { kind: 'response', id, method: 'history.find', result: { ok: true, value } });

export const dispatchHistorySaveResponse = (id: string): void =>
  dispatch(IPC.channels.toMain, { kind: 'response', id, method: 'history.save', result: { ok: true, value: null } });

export const dispatchWebmMetadataResponse = (id: string, value: WebmMetadata | null): void =>
  dispatch(IPC.channels.toMain, { kind: 'response', id, method: 'webm-metadata.read', result: { ok: true, value } });

export const dispatchFailure = (
  id: string,
  method: 'history.find' | 'history.save' | 'webm-metadata.read',
  error: RemoteFailure,
): void => dispatch(IPC.channels.toMain, { kind: 'response', id, method, result: { ok: false, error } });

export const remoteError = (method: RequestMethod, requestId: string, failure: RemoteFailure): MessageBusError =>
  new MessageBusError('remote', failure.message, method, requestId);

export const timeoutError = (method: RequestMethod, requestId: string): MessageBusError =>
  new MessageBusError('timeout', '', method, requestId);

export const failure = (error: unknown): RemoteFailure => ({
  code: 'handler-failed',
  message: error instanceof Error ? error.message : String(error),
});
