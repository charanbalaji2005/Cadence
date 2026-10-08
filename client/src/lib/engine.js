import { esc, isTouch } from './format.js';
import { genWords, quoteLen, QUOTES } from './words.js';
import { rand } from './format.js';

const kogasa = cv => 100 * (1 - Math.tanh(cv + Math.pow(cv, 3) / 3 + Math.pow(cv, 5) / 5));

/**
 * The typing engine works directly on the DOM so each keystroke costs one small
 * update instead of a React render. React owns the surrounding UI.
 *
 * els:   { words, track, wrap, caret, pace, input, counter, speed, lang }
 * hooks: { getSettings(), paceTarget(cfg), onFinish(result), onTyping(bool), sfx(kind), canFocus() }
 */
export class TypingEngine {
  constructor(els, hooks) {
    this.el = els; this.h = hooks;
    this.S = null; this.cfg = null; this.lastWords = null;
    this.lineH = 0; this.scrollY = 0; this.firstTop = 0; this.idleTimer = null;
  }
  get settings() { return this.h.getSettings(); }

  /* ---------- lifecycle ---------- */
  newTest(cfg, repeat = false) {
    this.stopTimers();
    this.cfg = cfg;
    const mode = cfg.mode, gen = { cap: true, prev: '' }, opt = { punctuation: cfg.punctuation, numbers: cfg.numbers };
    let words;
    if (repeat && this.lastWords && this.lastWords.mode === mode) words = this.lastWords.list.slice();
    else if (mode === 'time') words = genWords(120, gen, opt);
    else if (mode === 'words') words = genWords(cfg.words, gen, opt);
    else if (mode === 'quote') { const pool = QUOTES.filter(q => cfg.quoteLen === 'all' || quoteLen(q) === cfg.quoteLen); words = rand(pool.length ? pool : QUOTES).split(' '); }
    else if (mode === 'custom') { words = String(cfg.customText || '').trim().split(/\s+/).filter(Boolean); if (!words.length) words = ['type']; }
    else words = [''];
    if (cfg.punctuation && mode === 'words') { const l = words.length - 1; if (!/[.?!"')]$/.test(words[l])) words[l] = words[l].replace(/[,;]$/, '') + '.'; }
    this.lastWords = { mode, list: words.slice() };
    this.S = {
      mode, time: cfg.time, words, typed: [''], wi: 0, started: false, finished: false, start: 0, timer: null, raf: 0,
      keys: 0, correctKeys: 0, wrongKeys: 0, secKeys: 0, secErr: 0, seconds: [], gen, opt, committedLast: false,
      punctuation: cfg.punctuation, numbers: cfg.numbers, keyStats: {}, lastKey: 0, pace: this.h.paceTarget(cfg)
    };
    this.el.lang.textContent = mode === 'quote' ? 'english quote' : mode === 'custom' ? (cfg.customLabel || 'custom text') : mode === 'zen' ? 'zen, shift + enter to finish' : 'english';
    this.renderAllWords();
    this.scrollY = 0; this.el.track.style.transform = '';
    this.el.pace.hidden = true;
    this.h.onTyping(false);
    this.el.counter.textContent = ''; this.el.speed.textContent = '';
    this.measure(); this.placeCaret(); this.setIdle();
    this.focus();
  }
  destroy() { this.stopTimers(); clearTimeout(this.idleTimer); this.h.onTyping(false); }
  stopTimers() { if (this.S) { clearInterval(this.S.timer); cancelAnimationFrame(this.S.raf); } }
  get running() { return !!(this.S && this.S.started && !this.S.finished); }

  /* ---------- rendering ---------- */
  wordEl(i) { return this.el.words.children[i]; }
  lettersHtml(i, just = -1) {
    const S = this.S, t = S.typed[i] || '', exp = S.mode === 'zen' ? t : S.words[i];
    let h = '';
    for (let j = 0; j < exp.length; j++) {
      const cls = j < t.length ? (t[j] === exp[j] ? ' ok' : ' bad') : '';
      h += `<span class="l${cls}${j === just ? ' just' : ''}">${esc(exp[j])}</span>`;
    }
    for (let j = exp.length; j < t.length; j++) h += `<span class="l extra${j === just ? ' just' : ''}">${esc(t[j])}</span>`;
    return h;
  }
  renderWord(i, just) { const w = this.wordEl(i); if (w) w.innerHTML = this.lettersHtml(i, just); }
  renderAllWords() { this.el.words.innerHTML = this.S.words.map((_, i) => `<div class="word${i === 0 ? ' active' : ''}">${this.lettersHtml(i)}</div>`).join(''); }
  appendWords(n) {
    const S = this.S, start = S.words.length, more = genWords(n, S.gen, S.opt);
    S.words.push(...more);
    this.el.words.insertAdjacentHTML('beforeend', more.map((_, k) => `<div class="word">${this.lettersHtml(start + k)}</div>`).join(''));
  }
  measure() {
    const w = this.el.words.firstElementChild;
    if (!w || !w.offsetHeight) return;
    const cs = getComputedStyle(w);
    this.lineH = w.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    this.firstTop = w.offsetTop;
    this.el.wrap.style.height = (this.lineH * 3) + 'px';
  }
  placeCaret() {
    const S = this.S; if (!S) return;
    const w = this.wordEl(S.wi); if (!w) return;
    if (!this.lineH) this.measure();
    const t = (S.typed[S.wi] || '').length, L = w.children;
    let x, y, h, cw;
    if (t < L.length) { const l = L[t]; x = l.offsetLeft; y = l.offsetTop; h = l.offsetHeight; cw = l.offsetWidth; }
    else if (L.length) { const l = L[L.length - 1]; x = l.offsetLeft + l.offsetWidth; y = l.offsetTop; h = l.offsetHeight; cw = l.offsetWidth; }
    else { x = w.offsetLeft; y = w.offsetTop; h = w.offsetHeight; cw = h * 0.6; }
    const c = this.el.caret;
    c.style.setProperty('--ch', h + 'px'); c.style.setProperty('--cw', cw + 'px');
    c.style.transform = `translate(${x}px, ${y}px)`;
    if (this.lineH) {
      const row = Math.round((w.offsetTop - this.firstTop) / this.lineH);
      const target = Math.max(0, row - 1) * this.lineH;
      if (target !== this.scrollY) { this.scrollY = target; this.el.track.style.transform = `translateY(${-target}px)`; }
    }
  }
  setIdle() { this.el.caret.classList.add('blink'); }
  shake() { const c = this.el.caret; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  focus(force) {
    if (!this.h.canFocus()) return;
    if (isTouch() && !force && document.activeElement !== this.el.input) { this.updateFocus(); return; }
    this.el.input.focus({ preventScroll: true });
    this.updateFocus();
  }
  updateFocus() { this.el.wrap.classList.toggle('unfocused', document.activeElement !== this.el.input); }

  /* ---------- timing ---------- */
  start() {
    const S = this.S;
    S.started = true; S.start = performance.now();
    S.timer = setInterval(() => this.tick(), 100);
    if (S.pace > 0) { this.el.pace.hidden = false; S.raf = requestAnimationFrame(() => this.paceFrame()); }
  }
  correctCharCount() {
    const S = this.S; let n = 0;
    for (let i = 0; i <= S.wi; i++) {
      const t = S.typed[i] || '', exp = S.mode === 'zen' ? t : S.words[i];
      if (i < S.wi) { if (t === exp) n += exp.length + 1; } else if (exp.startsWith(t)) n += t.length;
    }
    return n;
  }
  recordSecond() {
    const S = this.S, s = S.seconds.length + 1;
    S.seconds.push({ raw: S.secKeys * 12, err: S.secErr, wpm: this.correctCharCount() / 5 / (s / 60) });
    S.secKeys = 0; S.secErr = 0;
  }
  tick() {
    const S = this.S, elapsed = (performance.now() - S.start) / 1000;
    while (S.seconds.length < Math.floor(elapsed)) this.recordSecond();
    if (S.mode === 'time' && elapsed >= S.time) { this.finish(); return; }
    this.updateCounter(elapsed);
  }
  updateCounter(elapsed) {
    const S = this.S, st = this.settings; if (!S.started) return;
    if (S.mode === 'time') this.el.counter.textContent = Math.max(0, Math.ceil(S.time - elapsed));
    else if (S.mode === 'zen') this.el.counter.textContent = Math.floor(elapsed);
    else this.el.counter.textContent = `${S.wi}/${S.words.length}`;
    const parts = [];
    if (st.liveSpeed && elapsed >= 1) parts.push(`<span>${Math.round(this.correctCharCount() / 5 / (elapsed / 60))} wpm</span>`);
    if (st.liveAcc && S.keys) parts.push(`<span>${Math.round(S.correctKeys / S.keys * 100)}%</span>`);
    this.el.speed.innerHTML = parts.join('');
  }
  paceFrame() {
    const S = this.S;
    if (!S || !S.started || S.finished) return;
    let chars = (performance.now() - S.start) / 1000 / 60 * S.pace * 5, i = 0;
    while (i < S.words.length && chars >= S.words[i].length + 1) { chars -= S.words[i].length + 1; i++; }
    const w = this.wordEl(i);
    if (!w) { this.el.pace.hidden = true; return; }
    const L = w.children, j = Math.floor(chars);
    let x, y, h;
    if (j < L.length) { x = L[j].offsetLeft; y = L[j].offsetTop; h = L[j].offsetHeight; }
    else if (L.length) { const l = L[L.length - 1]; x = l.offsetLeft + l.offsetWidth; y = l.offsetTop; h = l.offsetHeight; }
    else { x = w.offsetLeft; y = w.offsetTop; h = w.offsetHeight; }
    this.el.pace.style.setProperty('--ch', h + 'px');
    this.el.pace.style.transform = `translate(${x}px, ${y}px)`;
    S.raf = requestAnimationFrame(() => this.paceFrame());
  }

  /* ---------- input ---------- */
  handleChar(c) {
    const S = this.S, st = this.settings;
    if (!S || S.finished) return;
    const now = performance.now();
    if (c === ' ') {
      if (!S.started) return;
      const t = S.typed[S.wi];
      if (t === '') return;
      const exp = S.mode === 'zen' ? t : S.words[S.wi], ok = t === exp;
      S.keys++; S.secKeys++;
      if (ok) S.correctKeys++; else { S.wrongKeys++; S.secErr++; }
      if (!ok && st.stopOnError) { this.shake(); this.h.sfx('error'); this.afterInput(); return; }
      this.h.sfx(ok ? 'key' : 'error');
      S.lastKey = now;
      const w = this.wordEl(S.wi);
      w.classList.remove('active'); w.classList.toggle('err', !ok);
      if (S.mode !== 'zen' && S.mode !== 'time' && S.wi === S.words.length - 1) { S.committedLast = true; this.finish(); return; }
      S.wi++; S.typed[S.wi] = '';
      if (S.mode === 'zen') { S.words.push(''); this.el.words.insertAdjacentHTML('beforeend', '<div class="word"></div>'); }
      if (S.mode === 'time' && S.words.length - S.wi < 40) this.appendWords(60);
      this.wordEl(S.wi).classList.add('active');
      this.afterInput();
      return;
    }
    if (!S.started) this.start();
    const t = S.typed[S.wi], exp = S.mode === 'zen' ? null : S.words[S.wi];
    if (exp !== null && t.length >= exp.length + 12) return;
    const expected = exp === null ? c : exp[t.length];
    const ok = exp === null ? true : expected === c;
    if (exp !== null && expected !== undefined && /[a-z0-9]/i.test(expected)) {
      const k = expected.toLowerCase();
      const ks = S.keyStats[k] || (S.keyStats[k] = { n: 0, e: 0, ms: 0, mc: 0 });
      ks.n++; if (!ok) ks.e++;
      if (ok && S.lastKey && now - S.lastKey < 1500) { ks.ms += now - S.lastKey; ks.mc++; }
    }
    S.lastKey = now;
    S.keys++; S.secKeys++;
    if (ok) { S.correctKeys++; this.h.sfx('key'); } else { S.wrongKeys++; S.secErr++; this.h.sfx('error'); this.shake(); }
    if (!ok && st.stopOnError) { this.afterInput(); return; }
    S.typed[S.wi] = t + c;
    this.renderWord(S.wi, S.typed[S.wi].length - 1);
    if (S.mode !== 'zen' && S.mode !== 'time' && S.wi === S.words.length - 1 && S.typed[S.wi] === exp) { this.finish(); return; }
    this.afterInput();
  }
  handleBackspace(whole) {
    const S = this.S;
    if (!S || S.finished || !S.started) return;
    if (this.settings.confidence) { this.shake(); return; }
    if (S.typed[S.wi] === '') {
      if (S.wi === 0) return;
      const prev = S.wi - 1;
      if (S.mode !== 'zen' && S.typed[prev] === S.words[prev]) return; // correct words stay locked
      if (S.mode === 'zen') { this.wordEl(S.wi).remove(); S.words.pop(); } else this.wordEl(S.wi).classList.remove('active');
      S.typed.length = S.wi;
      S.wi = prev;
      const w = this.wordEl(prev); w.classList.remove('err'); w.classList.add('active');
      if (!whole) { this.renderWord(S.wi); this.afterInput(); return; }
    }
    S.typed[S.wi] = whole ? '' : S.typed[S.wi].slice(0, -1);
    this.renderWord(S.wi);
    this.afterInput();
  }
  finishZen() { if (this.S && this.S.mode === 'zen' && this.S.started) this.finish(); }
  afterInput() {
    this.placeCaret();
    this.el.caret.classList.remove('blink');
    clearTimeout(this.idleTimer); this.idleTimer = setTimeout(() => this.setIdle(), 650);
    if (this.S.started) { this.h.onTyping(true); this.updateCounter((performance.now() - this.S.start) / 1000); }
  }

  /* ---------- results ---------- */
  finish() {
    const S = this.S;
    if (S.finished) return;
    S.finished = true; this.stopTimers(); this.el.pace.hidden = true;
    const elapsed = S.mode === 'time' ? S.time : (performance.now() - S.start) / 1000;
    while (S.seconds.length < Math.floor(elapsed)) this.recordSecond();
    const frac = elapsed - S.seconds.length;
    if (frac > 0.2 && S.secKeys > 0) S.seconds.push({ raw: S.secKeys * 12 / frac, err: S.secErr, wpm: this.correctCharCount() / 5 / (elapsed / 60) });
    this.h.onTyping(false);
    if (elapsed < 1 || S.keys < 2) { this.newTest(this.cfg); return; }
    this.h.onFinish(this.computeResult(elapsed));
  }
  computeResult(elapsed) {
    const S = this.S;
    let correct = 0, incorrect = 0, extra = 0, missed = 0, wpmChars = 0;
    for (let i = 0; i <= S.wi; i++) {
      const t = S.typed[i] || '', exp = S.mode === 'zen' ? t : S.words[i];
      const committed = i < S.wi || S.committedLast || (i === S.words.length - 1 && t === exp && S.mode !== 'time' && S.mode !== 'zen');
      for (let j = 0; j < Math.min(t.length, exp.length); j++) t[j] === exp[j] ? correct++ : incorrect++;
      extra += Math.max(0, t.length - exp.length);
      if (committed) { missed += Math.max(0, exp.length - t.length); if (t === exp) wpmChars += exp.length + (i < S.wi ? 1 : 0); }
      else if (exp.startsWith(t)) wpmChars += t.length;
    }
    const min = elapsed / 60, raws = S.seconds.map(s => s.raw);
    const mean = raws.reduce((a, b) => a + b, 0) / (raws.length || 1);
    const sd = Math.sqrt(raws.reduce((a, b) => a + (b - mean) ** 2, 0) / (raws.length || 1));
    const r2 = v => Math.round(v * 100) / 100;
    return {
      wpm: r2(wpmChars / 5 / min), raw: r2(S.keys / 5 / min), acc: r2(S.keys ? S.correctKeys / S.keys * 100 : 0),
      consistency: r2(mean > 0 ? Math.max(0, kogasa(sd / mean)) : 0), chars: { correct, incorrect, extra, missed },
      elapsed: r2(elapsed), mode: S.mode, mode2: S.mode === 'time' ? String(S.time) : S.mode === 'words' ? String(S.words.length) : '',
      punctuation: S.mode === 'time' || S.mode === 'words' ? S.punctuation : false, numbers: S.mode === 'time' || S.mode === 'words' ? S.numbers : false,
      seconds: S.seconds.slice(), keyStats: S.keyStats, date: Date.now()
    };
  }
}
