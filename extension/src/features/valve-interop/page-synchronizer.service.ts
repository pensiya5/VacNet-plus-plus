import { getMessage } from '../../shared/services/i18n.service';
import type { ClipData } from '../../entities/clip.entity';
import { getAllowedValveSubmitUrl } from '../../shared/utils/url.utils';
import type { ValvePageCommitTransaction } from '../../shared/ports/review-video-host.port';
import type { ParsedValvePage } from './clip.parser';

const VERDICT_FIELDS = new Set(['aimassist', 'wallhack', 'autobhop', 'bot', 'verdict_labels[]']);
const SYNCHRONIZED_HIDDEN_FIELDS = new Set(['verdict_task']);
const MAX_HIDDEN_FIELD_LENGTH = 2_048;
const SYNCHRONIZED_SELECTORS = [
  '#detailsModalContent',
  '.perf_timing_area',
  '.modalgraph',
  '.evidencelog',
  '.accountdata',
  '.datasourcetable',
];

const ALLOWED_FRAGMENT_TAGS = new Set([
  'A', 'ABBR', 'B', 'BR', 'CODE', 'DD', 'DIV', 'DL', 'DT', 'EM', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'HR', 'I', 'LI', 'OL', 'P', 'PRE', 'SMALL', 'SPAN', 'STRONG',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL',
]);
const ALLOWED_FRAGMENT_ATTRIBUTES = new Set([
  'aria-label', 'aria-labelledby', 'aria-describedby', 'class', 'colspan', 'data-title',
  'dir', 'id', 'lang', 'role', 'rowspan', 'scope', 'title',
]);

const sanitizeFragmentNode = (node: Node): Node | null => {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '');
  if (!(node instanceof Element) || !ALLOWED_FRAGMENT_TAGS.has(node.tagName)) return null;

  const clone = document.createElement(node.tagName.toLowerCase());
  for (const attribute of Array.from(node.attributes)) {
    if (ALLOWED_FRAGMENT_ATTRIBUTES.has(attribute.name.toLowerCase())) {
      clone.setAttribute(attribute.name, attribute.value);
    }
  }
  for (const child of Array.from(node.childNodes)) {
    const safeChild = sanitizeFragmentNode(child);
    if (safeChild) clone.append(safeChild);
  }
  return clone;
};

const validateForms = (nextDocument: Document): { currentForm: HTMLFormElement; nextForm: HTMLFormElement } => {
  const currentForm = document.querySelector<HTMLFormElement>('#submitverdictform');
  if (!currentForm) throw new Error(getMessage("errValveCurrentFormRemoved"));
  const nextForm = nextDocument.querySelector<HTMLFormElement>('#submitverdictform');
  if (!nextForm) throw new Error(getMessage("errValveNextPageNoForm"));
  if (!nextForm.action) throw new Error(getMessage("errValveNextFormNoActionUrl"));
  if (!getAllowedValveSubmitUrl(nextForm.action)) {
    throw new Error(getMessage("errValveNextUnexpectedActionUrl", nextForm.action));
  }
  if (nextForm.method.toUpperCase() !== 'POST') {
    throw new Error(getMessage("errValveNextUnsupportedMethod", nextForm.method || "unknown"));
  }
  return { currentForm, nextForm };
};

const synchronizeForm = (nextDocument: Document): void => {
  const { currentForm, nextForm } = validateForms(nextDocument);
  currentForm.action = nextForm.action;
  currentForm.method = nextForm.method;
  for (const input of Array.from(currentForm.querySelectorAll<HTMLInputElement>('input'))) {
    if (!VERDICT_FIELDS.has(input.name)) input.remove();
  }
  for (const input of Array.from(nextForm.querySelectorAll<HTMLInputElement>('input'))) {
    if (!SYNCHRONIZED_HIDDEN_FIELDS.has(input.name)) continue;
    if (input.type !== 'hidden' || input.value.length === 0 || input.value.length > MAX_HIDDEN_FIELD_LENGTH) {
      throw new Error(getMessage("errValveInvalidFormField", [input.name, input.type, String(input.value.length)]));
    }
    const safeInput = document.createElement('input');
    safeInput.type = 'hidden';
    safeInput.name = input.name;
    safeInput.value = input.value;
    currentForm.append(safeInput);
  }
};

const synchronizeFragments = (nextDocument: Document): void => {
  for (const selector of SYNCHRONIZED_SELECTORS) {
    const current = document.querySelector(selector);
    const next = nextDocument.querySelector(selector);
    if (!current) continue;
    if (!next) {
      current.replaceChildren();
      continue;
    }
    current.replaceChildren(
      ...Array.from(next.childNodes).flatMap((node) => {
        const safeNode = sanitizeFragmentNode(node);
        return safeNode ? [safeNode] : [];
      }),
    );
  }
};

const synchronizeClipCount = (nextDocument: Document): void => {
  const nextCount = nextDocument.querySelector('.ClipCount')?.textContent.match(/\d+/u)?.[0];
  if (!nextCount) return;
  const currentCount = document.querySelector<HTMLElement>('.ClipCount');
  if (!currentCount) throw new Error(getMessage("errValveNoClipCounter"));
  const label = currentCount.textContent.trim();
  currentCount.textContent = /\d+/u.test(label) ? label.replace(/\d+/u, nextCount) : `${label} ${nextCount}`;
};

const storeCanonicalClip = (clip: ClipData): void => {
  const state = document.documentElement.dataset;
  state.vacnetClipTaskId = clip.taskId;
  state.vacnetClipVideoId = clip.videoId;
  state.vacnetClipSource = clip.sourceWebmUrl;
  state.vacnetClipStartTime = String(clip.range.start);
  state.vacnetClipEndTime = String(clip.range.end);
  state.vacnetClipEventTime = String(clip.eventTime);
};

const canonicalClipDatasetKeys = [
  'vacnetClipTaskId',
  'vacnetClipVideoId',
  'vacnetClipSource',
  'vacnetClipStartTime',
  'vacnetClipEndTime',
  'vacnetClipEventTime',
] as const;

const captureSnapshot = () => {
  const form = document.querySelector<HTMLFormElement>('#submitverdictform');
  if (!form) throw new Error(getMessage("errValveCurrentFormRemoved"));
  return {
    form,
    action: form.action,
    method: form.method,
    verdictInputs: Array.from(form.querySelectorAll<HTMLInputElement>('input'))
      .filter((input) => VERDICT_FIELDS.has(input.name))
      .map((input) => input.cloneNode(true)),
    fragments: SYNCHRONIZED_SELECTORS.flatMap((selector) => {
      const element = document.querySelector(selector);
      return element ? [{ element, children: Array.from(element.childNodes).map((child) => child.cloneNode(true)) }] : [];
    }),
    clipCount: document.querySelector<HTMLElement>('.ClipCount'),
    clipCountText: document.querySelector<HTMLElement>('.ClipCount')?.textContent ?? null,
    dataset: document.documentElement.dataset,
    canonicalClipState: canonicalClipDatasetKeys.map((key) => [key, document.documentElement.dataset[key]] as const),
  };
};

const createCommitRollback = (): (() => void) => {
  const snapshot = captureSnapshot();
  return () => {
    snapshot.form.action = snapshot.action;
    snapshot.form.method = snapshot.method;
    for (const input of Array.from(snapshot.form.querySelectorAll<HTMLInputElement>('input'))) {
      if (VERDICT_FIELDS.has(input.name)) input.remove();
    }
    for (const input of snapshot.verdictInputs) snapshot.form.append(input.cloneNode(true));
    for (const fragment of snapshot.fragments) {
      fragment.element.replaceChildren(...fragment.children.map((child) => child.cloneNode(true)));
    }
    if (snapshot.clipCount && snapshot.clipCountText !== null) snapshot.clipCount.textContent = snapshot.clipCountText;
    for (const [key, value] of snapshot.canonicalClipState) {
      if (value === undefined) delete snapshot.dataset[key];
      else snapshot.dataset[key] = value;
    }
  };
};


export const commitValvePage = (page: ParsedValvePage): ValvePageCommitTransaction => {
  const restore = createCommitRollback();
  let isActive = true;
  const rollback = (): void => {
    if (!isActive) return;
    isActive = false;
    restore();
  };

  try {
    synchronizeForm(page.document);
    synchronizeFragments(page.document);
    synchronizeClipCount(page.document);
    storeCanonicalClip(page.clip);
  } catch (error) {
    rollback();
    throw error;
  }

  return {
    rollback,
    finalize: () => { isActive = false; },
  };
};

export const validateValveCommit = (page: ParsedValvePage): void => {
  validateForms(page.document);
  if (page.clip.clipCount && !document.querySelector('.ClipCount')) {
    throw new Error(getMessage("errValveNoClipCounterTransition"));
  }
};

export const storeInitialValveClip = (clip: ClipData): void => {
  storeCanonicalClip(clip);
};
