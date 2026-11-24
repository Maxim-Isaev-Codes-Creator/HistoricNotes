const KEY = 'historic-cabinet-settings';
const MOBILE = matchMedia('(pointer: coarse)').matches;
const defaults = { quality: MOBILE ? 'low' : 'medium', shadows: !MOBILE, animations: true, speed: 'normal', hints:false, sounds: true, volume:45, effectsVolume:65, ambientVolume:25, lighting: MOBILE ? 'simple' : 'full' };
export function loadSettings() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...defaults }; }
}
export function saveSettings(value) { localStorage.setItem(KEY, JSON.stringify(value)); }
