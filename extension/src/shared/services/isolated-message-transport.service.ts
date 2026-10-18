import {
  parseFromMainWireMessage,
  type HistoryFindParams,
  type HistorySaveParams,
  type MainEvent,
  type WebmMetadataReadParams,
  type WebmMetadata,
} from '../ports/protocol.port';
import type { HistoryLookup } from '../../entities/history.entity';
import { MessageBusError, type IsolatedMessageBus } from '../ports/message-bus.port';
import { dispatchFailure, dispatchHistoryFindResponse, dispatchHistorySaveResponse, dispatchWebmMetadataResponse, dispatchToMain, failure, IPC } from '../utils/message-bus-wire.utils';

const HANDLER_UNAVAILABLE: ReturnType<typeof failure> = { code: 'handler-unavailable', message: '' };

export const createIsolatedMessageTransport = (): IsolatedMessageBus => {
  const listeners = new Set<(event: MainEvent) => void>();
  let historyFindHandler: ((params: HistoryFindParams) => Promise<HistoryLookup>) | null = null;
  let historySaveHandler: ((params: HistorySaveParams) => Promise<void>) | null = null;
  let webmMetadataReadHandler: ((params: WebmMetadataReadParams) => Promise<WebmMetadata | null>) | null = null;
  let isDisposed = false;

  const sendFailure = (id: string, method: 'history.find' | 'history.save' | 'webm-metadata.read', error: ReturnType<typeof failure>): void => {
    if (isDisposed) return;
    dispatchFailure(id, method, error);
  };

  const receive = (event: MessageEvent): void => {
    if (isDisposed || event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null | undefined;
    if (!data || typeof data !== 'object') return;
    const payload = data[IPC.postMessageKey] as { channel: string; message: unknown } | null | undefined;
    if (!payload || typeof payload !== 'object' || payload.channel !== IPC.channels.fromMain) return;
    const message = parseFromMainWireMessage(payload.message);
    if (!message) return;
    if (message.kind === 'event') {
      for (const listener of listeners) listener(message.event);
      return;
    }
    if (message.method === 'history.find') {
      if (!historyFindHandler) {
        sendFailure(message.id, message.method, HANDLER_UNAVAILABLE);
        return;
      }
      void historyFindHandler(message.params as HistoryFindParams)
        .then((value) => { if (!isDisposed) dispatchHistoryFindResponse(message.id, value); })
        .catch((error) => sendFailure(message.id, message.method, failure(error)));
      return;
    }
    if (message.method === 'webm-metadata.read') {
      if (!webmMetadataReadHandler) {
        sendFailure(message.id, message.method, HANDLER_UNAVAILABLE);
      } else {
        void webmMetadataReadHandler(message.params as WebmMetadataReadParams)
          .then((value) => { if (!isDisposed) dispatchWebmMetadataResponse(message.id, value); })
          .catch((error) => sendFailure(message.id, message.method, failure(error)));
      }
      return;
    }
    if (!historySaveHandler) {
      sendFailure(message.id, message.method, HANDLER_UNAVAILABLE);
      return;
    }
    void historySaveHandler(message.params as HistorySaveParams)
      .then(() => { if (!isDisposed) dispatchHistorySaveResponse(message.id); })
      .catch((error) => sendFailure(message.id, message.method, failure(error)));
  };

  window.addEventListener('message', receive);

  const register = <T>({
    getCurrent,
    handler,
    setCurrent,
  }: {
    getCurrent: () => T | null;
    handler: T;
    setCurrent: (value: T | null) => void;
  }): (() => void) => {
    if (isDisposed) throw new MessageBusError('disposed');
    if (getCurrent() !== null) {
      throw new MessageBusError('duplicate-handler', 'duplicate-handler: already registered');
    }

    setCurrent(handler);
    return () => {
      if (getCurrent() === handler) setCurrent(null);
    };
  };

  return {
    emit: (event) => {
      if (isDisposed) throw new MessageBusError('disposed');
      dispatchToMain({ kind: 'event', event });
    },
    subscribe: (listener) => {
      if (isDisposed) throw new MessageBusError('disposed');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    handleHistoryFind: (handler) => register({
      getCurrent: () => historyFindHandler,
      handler,
      setCurrent: (value) => { historyFindHandler = value; },
    }),
    handleHistorySave: (handler) => register({
      getCurrent: () => historySaveHandler,
      handler,
      setCurrent: (value) => { historySaveHandler = value; },
    }),
    handleWebmMetadataRead: (handler) => register({
      getCurrent: () => webmMetadataReadHandler,
      handler,
      setCurrent: (value) => { webmMetadataReadHandler = value; },
    }),
    dispose: () => {
      if (isDisposed) return;
      isDisposed = true;
      window.removeEventListener('message', receive);
      listeners.clear();
      historyFindHandler = null;
      historySaveHandler = null;
      webmMetadataReadHandler = null;
    },
  };
};
