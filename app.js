const $ = selector => document.querySelector(selector);
const pad = number => String(number).padStart(Math.max(3, String(state.endRange).length), '0');
let state;
try { state = restoreSession(localStorage.getItem(STORAGE_KEY)); } catch { state = restoreSession(null); }
let spinning = false;
let preparing = false;
let soundContext;
let soundMaster;
let toastTimer;
let celebrationFrame;
let signalFadeTimer;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let strips = [...document.querySelectorAll('.reel-strip')];
const spinButton = $('#spin-button');
const drawPanel = $('.draw-panel');
const stage = $('#draw-stage');
const announcement = $('#draw-announcement');
const dialog = $('#reset-dialog');
const settingsDialog = $('#settings-dialog');
const settingsButton = $('#settings-button');

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { toast('Browser storage is unavailable. Export your results before closing.'); }
}

function setStageLabel(label) {
  $('#stage-label').replaceChildren();
  for (const text of ['+', label, '+']) {
    const span = document.createElement('span');
    span.textContent = text;
    if (text === '+') span.className = 'tiny-cross';
    $('#stage-label').append(span);
  }
}

function syncReels() {
  const display = $('.number-display');
  const digitCount = Math.max(3, String(state.endRange).length);
  display.classList.toggle('four-digits', digitCount === 4);
  if (strips.length === digitCount) return;
  display.replaceChildren();
  for (let index = 0; index < digitCount; index++) {
    if (index) {
      const divider = document.createElement('span');
      divider.className = 'digit-divider';
      display.append(divider);
    }
    const reel = document.createElement('div');
    reel.className = 'reel';
    const strip = document.createElement('div');
    strip.className = 'reel-strip';
    reel.append(strip);
    display.append(reel);
  }
  strips = [...display.querySelectorAll('.reel-strip')];
}

function showRangeError(message = '') {
  $('#range-error').textContent = message;
  $('#range-error').hidden = !message;
  $('#end-range').setAttribute('aria-invalid', String(Boolean(message)));
}

function showWinnerLimitError(message = '') {
  $('#winner-limit-error').textContent = message;
  $('#winner-limit-error').hidden = !message;
  $('#winner-limit').setAttribute('aria-invalid', String(Boolean(message)));
}

function displayNumber(number) {
  strips.forEach((strip, index) => {
    strip.getAnimations().forEach(animation => animation.cancel());
    strip.style.transform = 'translateY(0)';
    strip.replaceChildren();
    const digit = document.createElement('span');
    digit.textContent = number == null ? '–' : pad(number)[index];
    strip.append(digit);
  });
}

function renderHistory() {
  const list = $('#winner-list');
  list.replaceChildren();
  const fragment = document.createDocumentFragment();
  state.winners.slice().reverse().forEach((winner, index) => {
    const item = document.createElement('li');
    item.className = `winner-card${index === 0 ? ' latest' : ''}`;
    const drawNumber = state.winners.length - index;
    const date = new Date(winner.at);
    item.innerHTML = `<div class="winner-card-top"><span>DRAW ${pad(drawNumber)}</span><svg aria-hidden="true"><use href="#i-cup"/></svg></div><div class="winner-number">${pad(winner.number)}</div><time class="winner-time"></time>${index === 0 ? '<span class="latest-label">LATEST</span>' : ''}`;
    const time = item.querySelector('time');
    time.dateTime = winner.at;
    time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    time.title = date.toLocaleString();
    item.setAttribute('aria-label', `Draw ${drawNumber}, winning number ${winner.number}, ${date.toLocaleString()}`);
    fragment.append(item);
  });
  list.append(fragment);
  list.hidden = state.winners.length === 0;
  $('#history-empty').hidden = state.winners.length > 0;
}

function renderControls() {
  const pool = availableNumbers(state.winners, state.endRange);
  const limitReached = state.winners.length >= state.winnerLimit;
  if ($('#end-range')) {
    $('#end-range').value = state.endRange;
    $('#end-range').disabled = spinning;
  }
  if ($('#winner-limit')) {
    $('#winner-limit').value = state.winnerLimit;
    $('#winner-limit').max = state.endRange;
    $('#winner-limit').disabled = spinning;
  }
  if ($('#winner-limit-hint')) $('#winner-limit-hint').textContent = `Choose from ${Math.max(1, state.winners.length)} to ${state.endRange.toLocaleString()}.`;
  if ($('#winner-limit-readout')) $('#winner-limit-readout').textContent = state.winnerLimit.toLocaleString();
  if ($('#intro-pool-size')) $('#intro-pool-size').textContent = state.endRange.toLocaleString();
  if ($('#intro-end-range')) $('#intro-end-range').textContent = pad(state.endRange);
  if ($('#stage-end-range')) $('#stage-end-range').textContent = pad(state.endRange);
  if ($('#reset-pool-size')) $('#reset-pool-size').textContent = state.endRange.toLocaleString();
  if ($('#remaining-count')) $('#remaining-count').textContent = pool.length;
  if ($('#winner-count')) $('#winner-count').textContent = String(state.winners.length).padStart(2, '0');
  if ($('#history-count')) $('#history-count').textContent = state.winners.length;
  if ($('#duration')) {
    $('#duration').value = state.duration;
    $('#duration').disabled = spinning;
  }
  if ($('#reset-button')) $('#reset-button').disabled = spinning || !state.winners.length;
  if ($('#export-button')) $('#export-button').disabled = !state.winners.length;
  if (spinButton) spinButton.disabled = spinning || !pool.length || limitReached;
  if ($('#spin-label')) $('#spin-label').textContent = preparing ? 'Preparing draw…' : spinning ? 'Drawing…' : limitReached ? 'Session complete' : !pool.length ? `All ${state.endRange.toLocaleString()} numbers drawn` : state.winners.length ? 'Start next draw' : 'Start draw';
  if ($('#sound-button')) {
    $('#sound-button').setAttribute('aria-pressed', String(state.sound));
    const soundLabel = state.sound ? 'Turn sound off' : 'Turn sound on';
    $('#sound-button').setAttribute('aria-label', soundLabel);
    $('#sound-button').title = soundLabel;
    const soundUse = $('#sound-button use');
    if (soundUse) soundUse.setAttribute('href', state.sound ? '#i-volume' : '#i-muted');
  }
  if (!spinning) {
    if (limitReached) {
      announcement.textContent = `${state.winnerLimit.toLocaleString()} ${state.winnerLimit === 1 ? 'winner' : 'winners'} selected for this session. Reset the session or raise the limit in settings.`;
      setStageLabel('SESSION COMPLETE');
    } else if (!pool.length) {
      announcement.textContent = `All ${state.endRange.toLocaleString()} numbers have been drawn. Reset the session to start again.`;
      setStageLabel('DRAW COMPLETE');
    } else if (state.winners.length) {
      announcement.textContent = `Winning number: ${state.winners.at(-1).number}.`;
      setStageLabel('WINNER SELECTED');
    } else {
      announcement.textContent = 'Press Start draw to select a number.';
      setStageLabel('READY TO DRAW');
    }
  }
}

function audioReady() {
  if (!state.sound) {
    if (soundMaster && soundContext) soundMaster.gain.setTargetAtTime(0, soundContext.currentTime, .01);
    return;
  }
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    soundContext ||= new AudioContext();
    if (!soundMaster) {
      soundMaster = soundContext.createGain();
      soundMaster.gain.value = 0;
      const limiter = soundContext.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 12;
      limiter.ratio.value = 6;
      soundMaster.connect(limiter);
      limiter.connect(soundContext.destination);
    }
    soundMaster.gain.setTargetAtTime(1, soundContext.currentTime, .02);
    if (soundContext.state === 'suspended') soundContext.resume().catch(() => {});
  } catch { /* The draw remains usable if the browser blocks sound. */ }
}

function tone(frequency, duration = 0.05, volume = 0.035, delay = 0, type = 'sine', endFrequency = frequency) {
  if (!state.sound || !soundContext || !soundMaster || soundContext.state === 'closed') return;
  const oscillator = soundContext.createOscillator();
  const gain = soundContext.createGain();
  const start = soundContext.currentTime + delay;
  const attack = Math.min(.018, duration * .2);
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.linearRampToValueAtTime(volume * .72, start + duration * .65);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(soundMaster);
  oscillator.start(start);
  oscillator.stop(start + duration + .03);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

function playReelLock(index) {
  tone(175 + index * 24, .2, .034, 0, 'triangle', 75 + index * 12);
  tone(620 + index * 95, .18, .018, .025, 'sine');
}

function playWinnerFanfare() {
  tone(130.81, .68, .035, 0, 'triangle', 65.4);
  [523.25, 659.25, 783.99].forEach((frequency, index) => tone(frequency, .75, .018, index * .09, 'triangle'));
  tone(1046.5, 1.05, .021, .32, 'sine');
  tone(1567.98, .65, .009, .48, 'sine');
}

async function animateReel(strip, finalDigit, index, duration) {
  const startDigit = parseInt(strip.textContent, 10) || 0;
  const cells = [startDigit];
  const cycles = reducedMotion.matches ? 1 : 4 + index;
  // The leftmost reel only visits leading digits allowed by the current range.
  const digitCount = index === 0 ? Math.floor(state.endRange / 10 ** (strips.length - 1)) + 1 : 10;
  for (let step = 1; step <= cycles * digitCount + ((finalDigit - startDigit + digitCount) % digitCount); step++) {
    cells.push((startDigit + step) % digitCount);
  }
  strip.replaceChildren(...cells.map(value => {
    const cell = document.createElement('span');
    cell.textContent = value;
    return cell;
  }));
  // Percentage transforms remain aligned if the viewport changes during a draw.
  const offset = (cells.length - 1) / cells.length * 100;
  const animation = strip.animate([
    { transform: 'translateY(0)' },
    { transform: `translateY(-${offset}%)` }
  ], { duration: duration - (strips.length - 1 - index) * (reducedMotion.matches ? 60 : 320), easing: 'cubic-bezier(.15,.55,.12,1)', fill: 'forwards' });
  await animation.finished;
  const cell = document.createElement('span');
  cell.textContent = finalDigit;
  animation.cancel();
  strip.replaceChildren(cell);
  playReelLock(index);
}

function triggerShockwave() {
  const shockwave = $('.impact-shockwave');
  if (!shockwave || reducedMotion.matches) return;
  shockwave.animate([
    { width: '0px', height: '0px', opacity: 0.95, borderColor: '#ffffff', borderWidth: '3px' },
    { width: '260px', height: '260px', opacity: 0.85, borderColor: '#d5bde8', borderWidth: '2.5px', offset: 0.35 },
    { width: '640px', height: '640px', opacity: 0, borderColor: '#7b52b0', borderWidth: '1px' }
  ], {
    duration: 700,
    easing: 'cubic-bezier(0.12, 0.8, 0.2, 1)',
    fill: 'none'
  });
}

function triggerImpactFlash() {
  const display = $('.number-display');
  if (!display || reducedMotion.matches) return;
  display.animate([
    { filter: 'brightness(1)' },
    { filter: 'brightness(2.4) drop-shadow(0 0 35px #d5bde8)', offset: 0.25 },
    { filter: 'brightness(1)' }
  ], {
    duration: 450,
    easing: 'ease-out',
    fill: 'none'
  });
}

async function playSignalPrelude() {
  if (reducedMotion.matches) return false;
  const sequence = $('#signal-sequence');
  const panelBounds = drawPanel.getBoundingClientRect();
  const padBounds = $('.number-display').getBoundingClientRect();
  const padLeft = padBounds.left - panelBounds.left;
  const padTop = padBounds.top - panelBounds.top;
  const satelliteSize = panelBounds.width < 520 ? 56 : 68;

  // Place the satellite far to the LEFT of the numbers and LOWER than them
  const isMobile = panelBounds.width < 520;
  const horizontalGap = isMobile ? Math.max(90, padLeft * 0.7) : Math.max(180, Math.min(300, padLeft * 0.75));
  const startX = Math.max(satelliteSize / 2 + 24, padLeft - horizontalGap);
  const padBottom = padTop + padBounds.height;
  const verticalDrop = isMobile ? 28 : 50;
  let startY = padBottom + verticalDrop;
  // Clamp so the satellite stays inside the draw stage
  const stageBounds = stage.getBoundingClientRect();
  const maxY = stageBounds.bottom - panelBounds.top - satelliteSize / 2 - 16;
  startY = Math.min(maxY, startY);

  // Beam shoots diagonally up-right towards the centre of the number display
  const targetX = padLeft + padBounds.width * 0.45;
  const targetY = padTop + padBounds.height * 0.5;

  const beam = sequence.querySelector('.signal-beam');
  const satellite = sequence.querySelector('.signal-satellite use');
  satellite.setAttribute('x', -satelliteSize / 2);
  satellite.setAttribute('y', -satelliteSize / 2);
  satellite.setAttribute('width', satelliteSize);
  satellite.setAttribute('height', satelliteSize);
  sequence.setAttribute('viewBox', `0 0 ${panelBounds.width} ${panelBounds.height}`);
  beam.setAttribute('d', `M ${startX} ${startY} L ${targetX} ${targetY}`);
  sequence.style.setProperty('--beam-length', beam.getTotalLength());

  // Rotate the satellite so its dish aims along the beam direction
  const angle = Math.atan2(targetY - startY, targetX - startX) * 180 / Math.PI;
  $('#signal-satellite-position').setAttribute('transform', `translate(${startX} ${startY}) rotate(${angle + 45})`);

  const target = sequence.querySelector('.signal-target');
  target.setAttribute('cx', targetX);
  target.setAttribute('cy', targetY);
  drawPanel.classList.add('is-preparing');
  stage.classList.add('is-preparing');

  // A rising cue follows the satellite and lands with the signal.
  tone(92, 1.04, .02, 0, 'triangle', 165);
  [392, 523.25, 659.25].forEach((frequency, index) => tone(frequency, .22, .019, .1 + index * .18, 'triangle', frequency * 1.35));
  tone(220, .5, .012, .52, 'sawtooth', 880);
  tone(115, .42, .045, 1.01, 'triangle', 55);
  tone(880, .25, .024, 1.03, 'sine', 440);

  // Trigger shockwave and digit flash when beam arrives at the numbers
  setTimeout(() => {
    triggerShockwave();
    triggerImpactFlash();
  }, 1040);

  // Start spinning during the shockwave (at 1080ms)
  await new Promise(resolve => setTimeout(resolve, 1080));
  return true;
}

async function spin() {
  if (spinning || dialog.open || settingsDialog.open) return;
  const pool = availableNumbers(state.winners, state.endRange);
  if (!pool.length || state.winners.length >= state.winnerLimit) return;
  let winner;
  try { winner = pool[randomIndex(pool.length)]; }
  catch { toast('Secure random selection is unavailable in this browser. Try a current browser.'); return; }
  spinning = true;
  preparing = true;
  clearTimeout(signalFadeTimer);
  drawPanel.classList.remove('is-signal-fading');
  const duration = reducedMotion.matches ? 650 : state.duration * 1000;
  audioReady();
  stage.classList.remove('has-winner');
  displayNumber(null);
  setStageLabel('PREPARING DRAW');
  announcement.textContent = 'Sending signal to the number pads…';
  renderControls();
  try {
    let showedPrelude = false;
    try { showedPrelude = await playSignalPrelude(); }
    catch (err) { console.error('Signal prelude error:', err); }
    finally {
      preparing = false;
      stage.classList.remove('is-preparing');
      drawPanel.classList.remove('is-preparing');
    }
    if (showedPrelude) {
      drawPanel.classList.add('is-signal-fading');
      signalFadeTimer = setTimeout(() => drawPanel.classList.remove('is-signal-fading'), 800);
    }
    stage.classList.add('is-spinning');
    setStageLabel('DRAW IN PROGRESS');
    announcement.textContent = 'Selecting from the available numbers…';
    renderControls();
    const spinStarted = performance.now();
    tone(95, duration / 1000, .011, 0, 'triangle', 150);
    const ticks = setInterval(() => {
      const progress = Math.min(1, (performance.now() - spinStarted) / duration);
      const pitch = 150 + progress * 190;
      tone(pitch, .075, .018, 0, 'triangle', pitch * .7);
    }, 170);
    const statusTimer = setTimeout(() => {
      setStageLabel('FINALIZING RESULT');
      tone(260, .45, .018, 0, 'triangle', 780);
    }, duration * 0.68);
    try {
      await Promise.all(strips.map((strip, index) => animateReel(strip, Number(pad(winner)[index]), index, duration)));
    } catch {
      // If rendering is interrupted, still reveal the selected result exactly once.
      displayNumber(winner);
    } finally {
      clearInterval(ticks);
      clearTimeout(statusTimer);
    }
    state.winners.push({ number: winner, at: new Date().toISOString() });
    stage.classList.remove('is-spinning');
    stage.classList.add('has-winner');
    setStageLabel('WINNER SELECTED');
    announcement.textContent = `Winning number: ${winner}.`;
    save();
    renderHistory();
    playWinnerFanfare();
    celebrate();
  } catch (err) {
    console.error('Spin error:', err);
    stage.classList.remove('is-spinning', 'is-preparing');
    drawPanel.classList.remove('is-preparing');
    toast('Draw encountered an issue. Please try again.');
  } finally {
    spinning = false;
    preparing = false;
    renderControls();
  }
}

function celebrate() {
  cancelAnimationFrame(celebrationFrame);
  if (reducedMotion.matches) return;
  const canvas = $('#confetti');
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  const colors = ['#4e2780', '#7b52b0', '#b98ee3', '#e2baff', '#d5bde8', '#ffffff', '#ffd166'];
  // Confetti rectangles
  const particles = Array.from({ length: 50 }, () => ({
    x: width / 2, y: height * 0.52,
    vx: (Math.random() - .5) * 10, vy: -Math.random() * 6 - 2,
    rotation: Math.random() * Math.PI,
    rotationSpeed: (Math.random() - .5) * .15,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: Math.random() * 3 + 2, type: 'rect'
  }));
  // Shimmer stars
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: width / 2, y: height * 0.52,
      vx: (Math.random() - .5) * 7, vy: -Math.random() * 4 - 1,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - .5) * .08,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 2 + 1.5, type: 'star',
      shimmer: Math.random() * Math.PI * 2
    });
  }
  const start = performance.now();
  let previous = start;
  function draw(now) {
    const progress = (now - start) / 2400;
    const step = Math.min((now - previous) / 16.67, 2);
    previous = now;
    context.clearRect(0, 0, width, height);
    if (progress >= 1) return;
    context.globalAlpha = Math.min(1, (1 - progress) * 2);
    particles.forEach(particle => {
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.vy += .12 * step;
      particle.rotation += particle.rotationSpeed * step;
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      if (particle.type === 'star') {
        particle.shimmer += 0.08 * step;
        const s = particle.size * (0.7 + 0.3 * Math.sin(particle.shimmer));
        // Circular celestial sparkle
        context.beginPath();
        context.arc(0, 0, s, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 1.8);
      }
      context.restore();
    });
    celebrationFrame = requestAnimationFrame(draw);
  }
  celebrationFrame = requestAnimationFrame(draw);
}

spinButton.addEventListener('click', spin);
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || dialog.open || settingsDialog.open) return;
  if (event.target.closest('input,select,textarea,button,a,[contenteditable="true"]')) return;
  event.preventDefault();
  spin();
});
$('#end-range').addEventListener('input', () => showRangeError());
$('#end-range').addEventListener('keydown', event => { if (event.key === 'Enter') $('#end-range').blur(); });
$('#end-range').addEventListener('change', event => {
  if (spinning) return;
  const endRange = Number(event.target.value);
  const highestWinner = Math.max(0, ...state.winners.map(winner => winner.number));
  if (!Number.isInteger(endRange) || endRange < 1 || endRange > MAX_END_RANGE) {
    showRangeError('Enter a whole number from 1 to 9999.');
    event.target.value = state.endRange;
    return;
  }
  if (endRange < highestWinner) {
    showRangeError(`Number ${highestWinner} was already drawn. Reset the session before using a lower limit.`);
    event.target.value = state.endRange;
    return;
  }
  showRangeError();
  const previousRange = state.endRange;
  state.endRange = endRange;
  state.winnerLimit = state.winnerLimit === previousRange ? endRange : Math.max(state.winners.length, Math.min(state.winnerLimit, endRange));
  syncReels();
  displayNumber(state.winners.at(-1)?.number);
  save();renderControls();
});
$('#winner-limit').addEventListener('input', () => showWinnerLimitError());
$('#winner-limit').addEventListener('keydown', event => { if (event.key === 'Enter') $('#winner-limit').blur(); });
$('#winner-limit').addEventListener('change', event => {
  if (spinning) return;
  const limit = Number(event.target.value);
  if (!Number.isInteger(limit) || limit < 1 || limit > state.endRange) {
    showWinnerLimitError(`Enter a whole number from 1 to ${state.endRange.toLocaleString()}.`);
    event.target.value = state.winnerLimit;
    return;
  }
  if (limit < state.winners.length) {
    showWinnerLimitError(`${state.winners.length} winners have already been drawn. Reset the session before using a lower target.`);
    event.target.value = state.winnerLimit;
    return;
  }
  showWinnerLimitError();
  state.winnerLimit = limit;
  save();
  renderControls();
});
$('#duration').addEventListener('change', event => { state.duration = Number(event.target.value);save(); });
settingsButton.addEventListener('click', () => {
  settingsDialog.showModal();
  settingsButton.setAttribute('aria-expanded', 'true');
  $('#end-range').focus();
});
$('#close-settings').addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('close', () => {
  settingsButton.setAttribute('aria-expanded', 'false');
  settingsButton.focus();
});
settingsDialog.addEventListener('click', event => {
  if (event.target !== settingsDialog) return;
  const box = settingsDialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) settingsDialog.close();
});
$('#sound-button').addEventListener('click', () => { state.sound = !state.sound;audioReady();tone(659, 0.1);save();renderControls(); });
$('#fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else toast('Fullscreen is unavailable here. Use your browser’s fullscreen option.');
  } catch { toast('Use your browser’s fullscreen option to expand the draw.'); }
});
document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
  $('#fullscreen-button').setAttribute('aria-label', label);
  $('#fullscreen-button').title = label;
});
$('#export-button').addEventListener('click', () => {
  if (!state.winners.length) return;
  const blob = new Blob(['\uFEFF', resultsCSV(state.winners)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `prize-draw-results-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);link.click();link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Results exported as CSV.');
});
$('#reset-button').addEventListener('click', () => { if (!spinning) dialog.showModal(); });
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#cancel-reset').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
$('#confirm-reset').addEventListener('click', () => {
  if (spinning) return;
  state.winners = [];
  save();displayNumber(null);renderHistory();renderControls();
  stage.classList.remove('has-winner');
  setStageLabel('READY TO DRAW');
  announcement.textContent = 'Press Start draw to select a number.';
  dialog.close();spinButton.focus();
  toast(`Session reset. ${state.endRange.toLocaleString()} numbers are available.`);
});
syncReels();displayNumber(state.winners.at(-1)?.number);
if (state.winners.length) {
  stage.classList.add('has-winner');
  setStageLabel('WINNER SELECTED');
  announcement.textContent = `Winning number: ${state.winners.at(-1).number}.`;
}
renderHistory();renderControls();
