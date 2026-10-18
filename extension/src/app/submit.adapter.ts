import { getMessage } from '../shared/services/i18n.service';
import { parseValvePage } from '../features/valve-interop/clip.parser';
import { commitValvePage, validateValveCommit } from '../features/valve-interop/page-synchronizer.service';
import { createValveSubmitRequest } from '../features/valve-interop/adapters/verdict-form.adapter';
import type { MainMessageBus } from '../shared/message-bus.adapter';
import { getAllowedValvePageUrl } from '../shared/utils/url.utils';
import type { SubmitCommand, SubmitRequestFactory, ValvePageClient, NextPageReader, ValvePageCommitter, HistoryPersistencePort, PageNavigator, ClipActivationPort, PlayerTransitionPort } from './submit.port';
import type { ParsedValvePage } from '../features/valve-interop/clip.parser';

export const createSubmitAdapters = (options: {
  bus: MainMessageBus;
  onActivated: (page: ParsedValvePage) => void;
  playerTransition: PlayerTransitionPort;
}): {
  requestFactory: SubmitRequestFactory;
  pageClient: ValvePageClient;
  pageReader: NextPageReader;
  pageCommitter: ValvePageCommitter;
  history: HistoryPersistencePort;
  navigator: PageNavigator;
  activation: ClipActivationPort;
  playerTransition: PlayerTransitionPort;
} => ({
  requestFactory: { create: (command: SubmitCommand, signal: AbortSignal) => createValveSubmitRequest(command.verdicts, command.badClip, signal) },
  pageClient: { submit: async (request) => {
    const response = await fetch(request.url, request.init);
    if (!response.ok) throw new Error(getMessage("errValveHttpStatus", String(response.status)));
    const responseUrl = getAllowedValvePageUrl(response.url);
    if (!responseUrl) throw new Error(getMessage("errValveUnexpectedResponseUrl"));
    return { url: responseUrl.href, contentType: response.headers.get('content-type') ?? '', text: () => response.text() };
  } },
  pageReader: { read: (html, baseUrl) => parseValvePage(html, baseUrl, (url) => options.bus.readWebmMetadata({ url })) },
  pageCommitter: { validate: validateValveCommit, commit: commitValvePage },
  history: { save: (params) => options.bus.saveHistory(params) },
  navigator: { replace: (url) => location.replace(url) },
  activation: { activate: options.onActivated },
  playerTransition: options.playerTransition,
});
