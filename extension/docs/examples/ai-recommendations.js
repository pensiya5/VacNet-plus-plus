// Плагин «ИИ-рекомендации» для VacNet++.
// Отправляет клип в локальную службу анализа (запускается отдельно), показывает
// этапы (скачивание → кадры → нейросеть), вероятности полосами и вывод —
// в карточке под панелью вердикта. Настройки — во вкладке «Плагины».
//
// Перед использованием запусти локальную службу анализа:
//   .venv/Scripts/python serve_api.py
// Решение всегда принимает человек — это подсказка, а не вердикт.

let busy = false;
let currentClip = null;
let pollTimer = null;

function show(card) {
  vacnet.ui.setCard(Object.assign({ title: 'ИИ-рекомендация', slot: 'review' }, card));
}

function fmtPct(value) {
  return Math.round(value * 100) + '%';
}

function fmtTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return minutes + ':' + String(secs).padStart(2, '0');
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function analyze(clip) {
  if (busy || !clip) return;
  busy = true;
  try {
    const settings = await vacnet.settings.get();
    const port = typeof settings.port === 'number' ? settings.port : 8770;
    const model = typeof settings.model === 'string' ? settings.model : undefined;
    const windows = typeof settings.windows === 'number' ? Math.round(settings.windows) : 3;
    const base = 'http://127.0.0.1:' + port;

    show({
      text: '',
      progress: { value: 0.02, label: 'Подключаюсь к службе ИИ…' },
      actions: [],
    });

    const create = await vacnet.net.fetch(base + '/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: clip.sourceWebmUrl,
        rangeStart: clip.range.start,
        rangeEnd: clip.range.end,
        model: model,
        windows: windows,
      }),
      timeoutMs: 30000,
    });
    if (!create.ok) {
      let message = 'HTTP ' + create.status;
      try { message = JSON.parse(create.text).error || message; } catch (e) { /* не JSON */ }
      show({ text: 'Служба вернула ошибку: ' + message, progress: null, actions: [{ key: 'analyze', label: 'Повторить' }] });
      return;
    }
    const jobId = JSON.parse(create.text).jobId;

    // Живой прогресс: сервер отдаёт этапы (скачивание → кадры → нейросеть).
    const result = await new Promise(function (resolve, reject) {
      pollTimer = setInterval(function () {
        void vacnet.net.fetch(base + '/status/' + jobId, { timeoutMs: 10000 })
          .then(function (statusResponse) {
            const status = JSON.parse(statusResponse.text);
            show({
              text: '',
              progress: { value: status.progress || 0, label: status.stageLabel || status.stage },
              actions: [],
            });
            if (status.stage === 'done') { stopPolling(); resolve(status.result); }
            if (status.stage === 'error') { stopPolling(); reject(new Error(status.error || 'сбой анализа')); }
          })
          .catch(function (error) {
            stopPolling();
            reject(error);
          });
      }, 600);
    });

    const bars = Object.entries(result.labels || {})
      .map(function (entry) { return { label: entry[0], value: entry[1] }; })
      .sort(function (a, b) { return b.value - a.value; });
    const top = result.suggested || { label: '—', confidence: 0 };
    const hint = top.confidence >= 0.5
      ? 'Похоже на «' + top.label + '» (' + fmtPct(top.confidence) + ') — проверь этот признак на видео.'
      : 'Явных признаков читов модель не видит (максимум ' + fmtPct(top.confidence) + ').';
    const windowNote = result.windows > 1 ? '\nОкон: ' + result.windows + ' (усреднено)' : '';
    // Длинные клипы: сервер возвращает топ-5 мест, где модель была увереннее всего.
    const moments = Array.isArray(result.moments) ? result.moments.slice(0, 3) : [];
    const momentsLine = moments.length
      ? '\nГде заметил: ' + moments.map(function (m) {
          return fmtTime(m.tSec) + ' — ' + m.label + ' ' + fmtPct(m.confidence);
        }).join(' · ')
      : '';
    show({
      text: hint + momentsLine + windowNote + '\nМодель: ' + result.model + ' · ' + result.elapsedMs + ' мс · решение за тобой.',
      bars: bars,
      actions: [{ key: 'analyze', label: 'Перепроверить' }],
      progress: null,
    });
  } catch (error) {
    const message = String((error && error.message) || error);
    if (message.indexOf('Failed to fetch') !== -1 || message.indexOf('NetworkError') !== -1 || message.indexOf('ERR_CONNECTION') !== -1) {
      show({
        text: 'Служба ИИ не отвечает. Запусти службу анализа и попробуй снова',
        actions: [{ key: 'analyze', label: 'Повторить' }],
        progress: null,
      });
    } else {
      show({
        text: 'Ошибка: ' + message.slice(0, 400),
        actions: [{ key: 'analyze', label: 'Повторить' }],
        progress: null,
      });
    }
  } finally {
    busy = false;
  }
}

vacnet.settings.define([
  { key: 'auto', type: 'toggle', label: 'Анализировать каждый новый клип автоматически', default: false },
  {
    key: 'model',
    type: 'choice',
    label: 'Модель',
    default: 'videomae_v5d_cascade_full',
    options: [
      'videomae_v5d_cascade_full',
      'videomae_v5a_cascade_event',
      'videomae_v5c_cascade_event',
      'videomae_v4_event',
      'videomae_v3_35ep',
      'mvit_v1',
    ],
  },
  { key: 'port', type: 'number', label: 'Порт локальной службы', default: 8770, min: 1024, max: 65535 },
  { key: 'windows', type: 'number', label: 'Окон для усреднения (1 — одно окно)', default: 3, min: 1, max: 6 },
]);

vacnet.on('clip-loaded', function (event) {
  currentClip = event.clip;
  void vacnet.settings.get()
    .then(function (settings) {
      if (settings.auto === true) {
        void analyze(currentClip);
      } else {
        show({ text: 'Нажми «Спросить ИИ», чтобы модель посмотрела клип.', actions: [{ key: 'analyze', label: 'Спросить ИИ' }] });
      }
    })
    .catch(function () {
      show({ text: 'Нажми «Спросить ИИ», чтобы модель посмотрела клип.', actions: [{ key: 'analyze', label: 'Спросить ИИ' }] });
    });
});

vacnet.on('card-action', function (event) {
  if (event.pluginId !== vacnet.plugin.id || event.key !== 'analyze') return;
  void analyze(currentClip);
});

vacnet.on('settings-changed', function (event) {
  if (event.pluginId !== vacnet.plugin.id) return;
  if (event.values.auto === true && currentClip) void analyze(currentClip);
});

// Выключение или замена плагина убирает карточку и опрос.
return function () {
  stopPolling();
  vacnet.ui.clearCard('review');
};
