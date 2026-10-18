// A synthetic site adapter, not a copy of the extension's review controller.
// Only the HTTP portal is replaced: extension scripts, media, runtime messages,
// storage, isolated/MAIN worlds and Plyr all run unchanged in Chromium.
export const portalHtml = (task = 'browser-task-1') => `<!doctype html>
<html lang="ru"><meta charset="utf-8"><link rel="icon" href="data:,"><title>Synthetic VACNET review</title>
<style>body{margin:20px;background:#17202b;color:white;font-family:Arial}.review-layout{display:flex;gap:24px}.video-column{width:640px}.verdict-column{width:450px}video{width:640px;height:360px}.footer-buttons{display:flex;gap:20px;margin-top:24px}
/* Portal videoreview.css: a pending answer locks the native play control. */
#video.vjs-play-locked .vjs-play-control{opacity:.38;pointer-events:none}</style>
<div class="review-layout"><div class="video-column"><div class="videocontainer">
<div id="video"><video id="video_html5_api" muted loop playsinline preload="auto"
 data-start-time="0" data-end-time="1.2" data-event-time="-1"
 src="https://replay-video.valve.net/synthetic/csow_0123456789abcdef.webm"></video></div>
</div></div><div class="verdict-column"><div class="verdicts-container">
<div id="verdictbuttons_cheating">
<input type="radio" name="cheating" value="positive">
<input type="radio" name="cheating" value="skip">
<input type="radio" name="cheating" value="negative"></div>
<button id="submitVerdictButton" disabled>Site confirm</button></div>
<form id="submitverdictform" method="post" action="https://www.counter-strike.net/vacnet/submit?synthetic=1">
<input name="verdict_task" type="hidden" value="${task}">
<input name="verdict_tick" id="form_verdict_tick" type="hidden">
</form></div></div><span class="ClipCount">Reviewed: 42</span>
<div class="footer-buttons"></div>
<script>
let furthestWatched = 0;
let progressFrozen = false;
window.BIsMatchWatched = () => false;
const video = document.querySelector('video');
const column = document.querySelector('.verdict-column');
const radios = [...document.querySelectorAll('input[name=cheating]')];
const confirmButton = document.querySelector('#submitVerdictButton');
let armingTimer;
let started = false;
const player = { hasStarted(value) { if (value !== undefined) started = value; return started; } };
window.videojs = Object.assign(() => player, { getPlayer: () => player });
window.fixture = { selections: [], cancelled: 0, submissions: [] };
// Portal freeze semantics: site handlers still own the original media element.
function UpdateProgress() {
  document.querySelector('#video').classList.toggle('vjs-play-locked', progressFrozen && video.currentTime >= furthestWatched - .1);
}
function SetWatchedProgressFrozen(frozen) {
  if (frozen) furthestWatched = Math.max(furthestWatched, video.currentTime);
  progressFrozen = frozen; UpdateProgress();
}
video.addEventListener('timeupdate', () => {
  if (video.seeking) return;
  if (!progressFrozen) furthestWatched = Math.max(furthestWatched, video.currentTime);
  else if (video.currentTime > furthestWatched) { video.pause(); video.currentTime = furthestWatched; }
  UpdateProgress();
});
video.addEventListener('play', () => {
  if (document.querySelector('#video').classList.contains('vjs-play-locked')) video.pause();
});
window.CancelVerdict = () => {
  clearTimeout(armingTimer);
  fixture.cancelled++;
  column.classList.remove('confirming');
  SetWatchedProgressFrozen(false);
  radios.forEach(input => { input.disabled = false; input.checked = false; });
  confirmButton.disabled = true;
  document.querySelector('#form_verdict_tick').value = '';
};
radios.forEach(input => input.addEventListener('change', () => {
  video.pause();
  SetWatchedProgressFrozen(true);
  fixture.selections.push(input.value);
  column.classList.add('confirming');
  radios.forEach(radio => radio.disabled = true);
  confirmButton.disabled = true;
  document.querySelector('#form_verdict_tick').value = (video.currentTime * 64).toFixed(2);
  armingTimer = setTimeout(() => { confirmButton.disabled = false; }, 450);
}));
// The portal owns submission. This adapter records locally and navigates to a
// second fixture; it never sends an actual verdict to the production server.
document.querySelector('#submitverdictform').submit = function() {
  const payload = Object.fromEntries(new FormData(this));
  fixture.submissions.push(payload);
  sessionStorage.setItem('fixture:last-submission', JSON.stringify(payload));
  location.assign('/vacnet/clips?synthetic=2');
};
confirmButton.addEventListener('click', () => {
  const form = document.querySelector('#submitverdictform');
  form.querySelectorAll('[name="verdict_labels[]"]').forEach(input => input.remove());
  const label = document.createElement('input'); label.name = 'verdict_labels[]'; label.type = 'hidden';
  label.value = { positive: 'guilty_cheating', skip: 'skip_cheating', negative: 'innocent_cheating' }[radios.find(input => input.checked).value];
  form.append(label); form.submit();
});
</script></html>`;
