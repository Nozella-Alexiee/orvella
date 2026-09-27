/* =====================================================================
   ORVELLA · sound.js — suara UI disintesis (WebAudio), tanpa file audio.
   Default MATI. Dinyalakan dari tombol (browser butuh interaksi dulu).
   SFX.play('tap'|'pop'|'ok'|'nope'|'whoosh'|'tick'|'level')
   ===================================================================== */
(function () {
  'use strict';
  let ctx = null, master = null;
  const get = () => { try { return localStorage.getItem('orv-sound') === '1'; } catch (e) { return false; } };
  const SFX = {
    enabled: get(),
    toggle(on = !this.enabled) {
      this.enabled = on;
      try { localStorage.setItem('orv-sound', on ? '1' : '0'); } catch (e) { /* diabaikan */ }
      if (on) { ensure(); this.play('ok'); }
      dispatchEvent(new CustomEvent('orv:sound', { detail: on }));
      return on;
    },
    play(name) {
      if (!this.enabled) return;
      if (!ensure()) return;
      const f = SOUNDS[name]; f && f(ctx.currentTime + .005);
    },
  };
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  function tone(t, freq, dur, { type = 'sine', vol = .12, to = null, attack = .006 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  }
  function noise(t, dur, { vol = .08, from = 400, to = 2400 } = {}) {
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  const SOUNDS = {
    tap: t => tone(t, 880, .05, { vol: .05, type: 'triangle' }),
    pop: t => tone(t, 420, .09, { to: 980, vol: .1 }),
    tick: t => tone(t, 1320, .03, { vol: .04, type: 'square' }),
    ok: t => { tone(t, 784, .12, { type: 'triangle' }); tone(t + .08, 1047, .16, { type: 'triangle' }); tone(t + .16, 1319, .22, { type: 'triangle', vol: .1 }); },
    nope: t => { tone(t, 262, .16, { type: 'triangle', vol: .1, to: 220 }); tone(t + .1, 233, .2, { type: 'triangle', vol: .08, to: 196 }); },
    whoosh: t => noise(t, .35, { vol: .06, from: 300, to: 3200 }),
    level: t => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * .07, f, .26, { type: 'triangle', vol: .09 })); noise(t + .3, .4, { vol: .03, from: 4000, to: 9000 }); },
  };
  window.SFX = SFX;
})();
