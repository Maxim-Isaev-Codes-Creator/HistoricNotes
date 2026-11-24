const KEY = 'historic-cabinet-settings';
const defaults = { quality: 'medium', shadows: true, animations: true, speed: 'normal', hints:false, sounds: true, volume:45, effectsVolume:65, ambientVolume:25, lighting: 'full' };
export function loadSettings() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...defaults }; }
}
export function saveSettings(value) { localStorage.setItem(KEY, JSON.stringify(value)); }
