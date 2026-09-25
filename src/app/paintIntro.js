/*
 * The loading screen's picture (#89): a painted view of the island at golden hour, drawn on a canvas behind the start
 * card as soon as the page opens (a classic script, before the game's modules load): the sky and sun, the sea with its
 * sparkle, the island's hills and spruces, the apple tree, the cabin with a lit window and a wisp of smoke, the jetty
 * and the sailboat, then brush dabs and a paper grain over it all for a painted look. No image files.
 */
(function () {
  var intro = document.getElementById('intro'); if (!intro) return;
  var cv = document.createElement('canvas'); cv.id = 'introArt'; intro.insertBefore(cv, intro.firstChild);
  function paint() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5), W = cv.width = Math.round(innerWidth * dpr), H = cv.height = Math.round(innerHeight * dpr), g = cv.getContext('2d');
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    var hz = H * 0.6, s = Math.min(W, H) / 900;
    // sky and sun
    var sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#3d5d88'); sky.addColorStop(0.55, '#c99a88'); sky.addColorStop(0.85, '#f1c089'); sky.addColorStop(1, '#f8dcaa');
    g.fillStyle = sky; g.fillRect(0, 0, W, hz);
    var sx = W * 0.74, sy = hz - 60 * s, sun = g.createRadialGradient(sx, sy, 0, sx, sy, 260 * s); sun.addColorStop(0, 'rgba(255,244,210,1)'); sun.addColorStop(0.12, 'rgba(255,226,160,0.9)'); sun.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = sun; g.fillRect(0, 0, W, hz);
    for (var c = 0; c < 7; c++) { var cx = rnd() * W, cy = hz * (0.15 + 0.4 * rnd()), cw = (140 + 220 * rnd()) * s; for (var k = 0; k < 14; k++) { g.fillStyle = 'rgba(255,' + (205 + 30 * rnd() | 0) + ',' + (190 + 30 * rnd() | 0) + ',0.12)'; g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * cw, cy + (rnd() - 0.5) * 18 * s, cw * (0.2 + 0.25 * rnd()), 12 * s * (0.6 + rnd()), 0, 0, 7); g.fill(); } }
    // sea
    var sea = g.createLinearGradient(0, hz, 0, H); sea.addColorStop(0, '#7f9fae'); sea.addColorStop(0.35, '#45707f'); sea.addColorStop(1, '#23434f');
    g.fillStyle = sea; g.fillRect(0, hz, W, H - hz);
    for (var i = 0; i < 260; i++) { var y = hz + Math.pow(rnd(), 1.6) * (H - hz), x = sx + (rnd() - 0.5) * (80 + (y - hz) * 1.1), l = (6 + 30 * rnd()) * s * (1 + (y - hz) / H); g.strokeStyle = 'rgba(255,230,180,' + (0.15 + 0.4 * rnd()) * (1 - (y - hz) / (H - hz)) + ')'; g.lineWidth = (1 + 2 * rnd()) * s; g.beginPath(); g.moveTo(x - l / 2, y); g.lineTo(x + l / 2, y); g.stroke(); }
    // the island: far hills, near hills, the beach
    function hill(y0, amp, col, f, ph) { g.fillStyle = col; g.beginPath(); g.moveTo(W * 0.02, hz + 4 * s); for (var x = 0; x <= 1; x += 0.01) { var X = W * (0.02 + 0.8 * x), e = Math.sin(Math.PI * x); g.lineTo(X, hz - (y0 + amp * (0.6 * Math.sin(x * f + ph) + 0.4 * Math.sin(x * f * 2.3 + ph * 1.7))) * e * s); } g.lineTo(W * 0.82, hz + 4 * s); g.closePath(); g.fill(); }
    hill(95, 35, '#556b4c', 5, 1); hill(70, 25, '#3f5a36', 7, 3);
    g.fillStyle = '#d9c095'; g.beginPath(); g.moveTo(W * 0.03, hz + 5 * s); g.quadraticCurveTo(W * 0.42, hz - 8 * s, W * 0.81, hz + 5 * s); g.quadraticCurveTo(W * 0.42, hz + 16 * s, W * 0.03, hz + 5 * s); g.fill();
    // spruces
    function spruce(x, base, h, col) { for (var t = 0; t < 4; t++) { var w = h * (0.34 - t * 0.06), y = base - h * t * 0.22; g.fillStyle = col; g.beginPath(); g.moveTo(x - w, y); g.lineTo(x, y - h * 0.42); g.lineTo(x + w, y); g.closePath(); g.fill(); } }
    for (var n = 0; n < 60; n++) { var u = rnd(), X = W * (0.06 + 0.72 * u), top = Math.sin(Math.PI * u), b = hz - (55 + 40 * rnd()) * top * s; if (rnd() < 0.8 && Math.abs(u - 0.45) > 0.08) spruce(X, b + 8 * s, (26 + 30 * rnd()) * s, rnd() < 0.5 ? '#233a26' : '#2c4630'); }
    // the apple tree
    var ax = W * 0.36, ay = hz - 52 * s; g.fillStyle = '#4a3526'; g.fillRect(ax - 3 * s, ay, 6 * s, 26 * s);
    for (var a = 0; a < 26; a++) { g.fillStyle = rnd() < 0.15 ? '#b8392a' : ['#4f7a34', '#5d8a3c', '#3f6a2c'][a % 3]; g.beginPath(); g.arc(ax + (rnd() - 0.5) * 38 * s, ay - (8 + 22 * rnd()) * s, (5 + 8 * rnd()) * s, 0, 7); g.fill(); }
    // the cabin, lit window, smoke
    var hx = W * 0.47, hy = hz - 50 * s, cw2 = 64 * s, ch = 30 * s;
    g.fillStyle = '#6b4a30'; g.fillRect(hx, hy - ch, cw2, ch); for (var r = 0; r < 6; r++) { g.fillStyle = 'rgba(40,24,14,0.35)'; g.fillRect(hx, hy - ch + r * ch / 6, cw2, 1.5 * s); }
    g.fillStyle = '#3b2c22'; g.beginPath(); g.moveTo(hx - 8 * s, hy - ch); g.lineTo(hx + cw2 / 2, hy - ch - 26 * s); g.lineTo(hx + cw2 + 8 * s, hy - ch); g.closePath(); g.fill();
    g.fillStyle = '#6f6a62'; g.fillRect(hx + 10 * s, hy - ch - 30 * s, 8 * s, 18 * s);
    var win = g.createRadialGradient(hx + 40 * s, hy - 16 * s, 0, hx + 40 * s, hy - 16 * s, 20 * s); win.addColorStop(0, 'rgba(255,210,120,0.9)'); win.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = win; g.fillRect(hx + 20 * s, hy - 36 * s, 40 * s, 40 * s);
    g.fillStyle = '#ffd98a'; g.fillRect(hx + 34 * s, hy - 22 * s, 12 * s, 10 * s);
    for (var m = 0; m < 12; m++) { g.fillStyle = 'rgba(210,205,200,' + (0.2 - m * 0.014) + ')'; g.beginPath(); g.arc(hx + 14 * s + m * 5 * s, hy - ch - 36 * s - m * 9 * s, (4 + m * 1.6) * s, 0, 7); g.fill(); }
    // the jetty and the sailboat
    var jx = W * 0.66, jy = hz + 6 * s; g.strokeStyle = '#4b3a2a'; g.lineWidth = 5 * s; g.beginPath(); g.moveTo(jx, jy); g.lineTo(jx + 150 * s, jy + 10 * s); g.stroke();
    for (var p = 0; p < 7; p++) { g.lineWidth = 2 * s; g.beginPath(); g.moveTo(jx + p * 24 * s, jy + p * 1.6 * s); g.lineTo(jx + p * 24 * s, jy + 12 * s + p * 1.6 * s); g.stroke(); }
    var bx = jx + 120 * s, by = jy + 30 * s; g.fillStyle = '#f2efe8'; g.beginPath(); g.moveTo(bx - 34 * s, by); g.lineTo(bx + 38 * s, by); g.lineTo(bx + 28 * s, by + 10 * s); g.lineTo(bx - 28 * s, by + 10 * s); g.closePath(); g.fill();
    g.fillStyle = '#9b2a2a'; g.fillRect(bx - 30 * s, by + 3 * s, 62 * s, 2.5 * s);
    g.strokeStyle = '#3a2a1e'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - 70 * s); g.stroke();
    g.fillStyle = 'rgba(250,246,236,0.95)'; g.beginPath(); g.moveTo(bx + 2 * s, by - 66 * s); g.lineTo(bx + 2 * s, by - 6 * s); g.lineTo(bx + 34 * s, by - 6 * s); g.closePath(); g.fill();
    g.fillStyle = 'rgba(244,236,222,0.9)'; g.beginPath(); g.moveTo(bx - 2 * s, by - 60 * s); g.lineTo(bx - 2 * s, by - 8 * s); g.lineTo(bx - 26 * s, by - 8 * s); g.closePath(); g.fill();
    // brush dabs and paper grain
    for (var d = 0; d < 2600; d++) { var X2 = rnd() * W, Y2 = rnd() * H, px = g.getImageData(X2 | 0, Y2 | 0, 1, 1).data; g.fillStyle = 'rgba(' + px[0] + ',' + px[1] + ',' + px[2] + ',0.55)'; g.beginPath(); g.ellipse(X2, Y2, (3 + 6 * rnd()) * s, (1.5 + 2 * rnd()) * s, rnd() * 3.14, 0, 7); g.fill(); }
    var grain = g.getImageData(0, 0, W, H), gd = grain.data; for (var q = 0; q < gd.length; q += 4) { var v = (rnd() - 0.5) * 14; gd[q] += v; gd[q + 1] += v; gd[q + 2] += v; } g.putImageData(grain, 0, 0);
  }
  try { paint(); } catch (e) { /* a plain background is fine */ }
})();
