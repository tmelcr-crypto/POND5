/**
 * Performance overlay: FPS (1 s average), frame time, draw calls and triangles of the last frame
 * (total incl. shadow pass, and the main pass alone from renderer.info), plus the world's tree LOD buckets.
 * Toggled with the "Stats" button (works on touch) or the backquote key; the choice is remembered per browser.
 */
export function createDebugOverlay(renderer, { scatter }) {
  let on = false;
  // renderer.info (r128) leaves out the shadow pass, so count every draw on the GL context while the overlay is shown
  const gl = renderer.getContext(), total = { calls: 0, tris: 0, last: [0, 0] };
  const tri = (mode, n) => (mode === gl.TRIANGLES ? n / 3 : mode === gl.TRIANGLE_STRIP ? n - 2 : 0);
  const wraps = { drawElements: a => tri(a[0], a[1]), drawArrays: a => tri(a[0], a[2]), drawElementsInstanced: a => tri(a[0], a[1]) * a[4], drawArraysInstanced: a => tri(a[0], a[2]) * a[3] };
  for (const [name, f] of Object.entries(wraps)) { const o = gl[name]; if (!o) continue; gl[name] = function (...a) { if (on) { total.calls++; total.tris += f(a); } return o.apply(this, a); }; }
  const btn = document.getElementById('statsBtn'), box = document.getElementById('stats');
  on = false; try { on = localStorage.getItem('meadow.stats') === '1'; } catch (e) {}
  function set(v) { on = v; box.hidden = !on; btn.setAttribute('aria-pressed', String(on)); try { localStorage.setItem('meadow.stats', on ? '1' : '0'); } catch (e) {} }
  btn.addEventListener('pointerdown', e => e.stopPropagation());
  btn.addEventListener('click', () => set(!on));
  addEventListener('keydown', e => { if (e.code === 'Backquote' && !e.repeat) set(!on); });
  set(on);
  let n = 0, acc = 0, last = 0, worst = 0;
  const fmt = v => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(v));
  return {
    frame(now) {
      total.last = [total.calls, total.tris]; total.calls = 0; total.tris = 0;
      const dt = last ? now - last : 16.7; last = now; n++; acc += dt; worst = Math.max(worst, dt);
      if (!on || acc < 1000) { if (acc >= 1000) { n = 0; acc = 0; worst = 0; } return; }
      const r = renderer.info.render, l = scatter.stats.lod;
      box.textContent = `${Math.round(n * 1000 / acc)} fps  ${(acc / n).toFixed(1)} ms (max ${worst.toFixed(0)})\n` +
        `draw calls ${total.last[0]} (main ${r.calls})\ntriangles ${fmt(total.last[1])} (main ${fmt(r.triangles)})\ntrees ${l[0]} near / ${l[1]} mid / ${l[2]} far\n` +
        `px ratio ${renderer.getPixelRatio().toFixed(2)}`;
      n = 0; acc = 0; worst = 0;
    },
  };
}
