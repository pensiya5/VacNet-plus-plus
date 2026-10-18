import { getMessage } from '../../../shared/services/i18n.service';
import { verdictNames, type VerdictSelection } from '../../../entities/verdict.entity';
import { getAllowedValveSubmitUrl } from '../../../shared/utils/url.utils';

export interface ValveSubmitRequest {
  url: string;
  init: RequestInit;
}

const verdictLabel = (name: (typeof verdictNames)[number], value: VerdictSelection[typeof name]): string => {
  if (value === 'positive') return `guilty_${name}`;
  if (value === 'negative') return `innocent_${name}`;
  return `skip_${name}`;
};

export const createValveSubmitRequest = (
  verdicts: VerdictSelection,
  badClip: boolean,
  signal: AbortSignal,
): ValveSubmitRequest => {
  const form = document.querySelector<HTMLFormElement>('#submitverdictform');
  if (!form) throw new Error(getMessage("errValveFormNotFound"));
  if (!form.action) throw new Error(getMessage("errValveFormNoAction"));
  const action = getAllowedValveSubmitUrl(form.action);
  if (!action) throw new Error(getMessage("errValveUnexpectedEndpoint", form.action));
  if (form.method.toUpperCase() !== 'POST') {
    throw new Error(getMessage("errValveUnsupportedMethod", form.method || "unknown"));
  }

  const taskFields = Array.from(form.querySelectorAll<HTMLInputElement>("input[name='verdict_task']"));
  if (taskFields.length !== 1) throw new Error(getMessage("errValveFormTaskFieldCount"));
  const taskField = taskFields[0];
  if (!taskField) throw new Error(getMessage("errValveFormNoTaskField"));
  if (taskField.type !== 'hidden' || taskField.value.length === 0 || taskField.value.length > 2_048) {
    throw new Error(getMessage("errValveInvalidTaskField", [taskField.type, String(taskField.value.length)]));
  }

  const body = new FormData();
  body.append('verdict_task', taskField.value);
  if (badClip) body.append('verdict_labels[]', 'tag_badclip');
  else {
    for (const name of verdictNames) {
      body.append('verdict_labels[]', verdictLabel(name, verdicts[name]));
    }
  }

  return {
    url: action.href,
    init: {
      method: 'POST',
      body,
      credentials: 'same-origin',
      redirect: 'follow',
      signal,
    },
  };
};
