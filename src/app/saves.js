/**
 * Your progress, from the settings panel (#75, #90): Export downloads it as a small file (meadow-save.json), Import
 * reads such a file back (and reloads), Reset asks, clears it and starts a fresh island. Progress is everything the
 * game keeps in the browser under 'meadow.' except the settings (volume, sound, music, stats overlay), which stay.
 */
const SETTINGS = new Set(['meadow.soundVolume', 'meadow.muted', 'meadow.music', 'meadow.stats']);
const progressKeys = () => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('meadow.') && !SETTINGS.has(k)) out.push(k); } } catch (err) { void err; } return out; };

export function createSaves() {
  const $ = id => document.getElementById(id);
  function exportSave() {
    const data = { game: 'meadow-pond', version: 1, saved: new Date().toISOString(), keys: {} };
    progressKeys().forEach(k => { data.keys[k] = localStorage.getItem(k); });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'meadow-save.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function importSave(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result); if (!d || d.game !== 'meadow-pond' || typeof d.keys !== 'object') throw new Error('not a Meadow pond save');
        progressKeys().forEach(k => localStorage.removeItem(k));
        Object.entries(d.keys).forEach(([k, v]) => { if (k.startsWith('meadow.') && !SETTINGS.has(k) && typeof v === 'string') localStorage.setItem(k, v); });
        location.reload();
      } catch (err) { alert('Could not load that file: ' + err.message); }
    };
    r.readAsText(file);
  }
  function reset() {
    if (!confirm('Start a fresh island? Everything you carry, store, placed, lit and the season go back to the start. Your settings stay.')) return;
    progressKeys().forEach(k => localStorage.removeItem(k)); location.reload();
  }
  const pick = document.createElement('input'); pick.type = 'file'; pick.accept = 'application/json,.json'; pick.style.display = 'none'; document.body.appendChild(pick);
  pick.addEventListener('change', () => { if (pick.files && pick.files[0]) importSave(pick.files[0]); pick.value = ''; });
  if ($('saveExport')) $('saveExport').addEventListener('click', exportSave);
  if ($('saveImport')) $('saveImport').addEventListener('click', () => pick.click());
  if ($('saveReset')) $('saveReset').addEventListener('click', reset);
  return { exportSave, reset, keys: progressKeys };
}
