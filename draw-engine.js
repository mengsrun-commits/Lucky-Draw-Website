const DEFAULT_END_RANGE = 500;
const MAX_END_RANGE = 9999;
const STORAGE_KEY = 'orbit-draw-session-v1';

function availableNumbers(winners, endRange = DEFAULT_END_RANGE) {
  if (!Number.isInteger(endRange) || endRange < 1 || endRange > MAX_END_RANGE) throw new RangeError('Invalid end range');
  const drawn = new Set(winners.map(winner => winner.number));
  return Array.from({ length: endRange }, (_, index) => index + 1).filter(number => !drawn.has(number));
}

// Rejection sampling avoids giving any pool entry a modulo bias.
function randomIndex(length, random = globalThis.crypto) {
  if (!Number.isInteger(length) || length < 1 || length > MAX_END_RANGE) throw new RangeError('Invalid pool size');
  const limit = Math.floor(0x100000000 / length) * length;
  const value = new Uint32Array(1);
  do { random.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % length;
}

function restoreSession(raw) {
  const defaults = { winners: [], endRange: DEFAULT_END_RANGE, winnerLimit: DEFAULT_END_RANGE, duration: 5, sound: false };
  if (!raw) return defaults;
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return defaults;
    const winners = Array.isArray(saved.winners) ? saved.winners.filter(winner =>
      winner && Number.isInteger(winner.number) && winner.number >= 1 && winner.number <= MAX_END_RANGE &&
      typeof winner.at === 'string' && Number.isFinite(Date.parse(winner.at))
    ).map(winner => ({ number: winner.number, at: winner.at })) : [];
    const savedRange = Number.isInteger(saved.endRange) && saved.endRange >= 1 && saved.endRange <= MAX_END_RANGE ? saved.endRange : DEFAULT_END_RANGE;
    const endRange = Math.max(savedRange, ...winners.map(winner => winner.number));
    const savedLimit = Number.isInteger(saved.winnerLimit) && saved.winnerLimit >= 1 && saved.winnerLimit <= endRange ? saved.winnerLimit : endRange;
    const winnerLimit = Math.max(savedLimit, Math.min(winners.length, endRange));
    return { winners, endRange, winnerLimit, duration: [3, 5, 8].includes(saved.duration) ? saved.duration : 5, sound: saved.sound === true };
  } catch { return defaults; }
}

function resultsCSV(winners) {
  return ['Draw,Winning number,Time (ISO 8601)', ...winners.map((winner, index) => `${index + 1},${winner.number},${winner.at}`)].join('\r\n');
}
