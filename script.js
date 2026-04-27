/* =========================================================================
   K + A · CDMX 2027 — Slideshow engine
   Auto-starts on DOMContentLoaded. No scroll. No click-to-begin.
   ========================================================================= */

(() => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------------------------------------------------------------
  // Pausable + abortable scheduler.
  // Every timed wait in the slideshow goes through `sleep`. Pausing the
  // slideshow halts all pending sleeps (and audio); skipping a scene
  // aborts them, rejecting with a sentinel that the run loop catches.
  // ---------------------------------------------------------------------
  const pending = new Set();
  let paused = false;
  let abortCtl = null;
  const ABORT = Symbol('aborted');

  function scheduleEntry(entry) {
    entry.startedAt = performance.now();
    entry.timer = setTimeout(() => {
      if (entry.signalCleanup) entry.signalCleanup();
      pending.delete(entry);
      entry.resolve();
    }, entry.remaining);
  }

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const signal = abortCtl ? abortCtl.signal : null;
      if (signal && signal.aborted) { reject(ABORT); return; }

      const entry = { remaining: ms, resolve, timer: null, startedAt: 0 };

      const onAbort = () => {
        if (entry.timer) clearTimeout(entry.timer);
        pending.delete(entry);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(ABORT);
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      entry.signalCleanup = () => signal && signal.removeEventListener('abort', onAbort);

      pending.add(entry);
      if (!paused) scheduleEntry(entry);
    });
  }

  function pauseAll() {
    if (paused) return;
    paused = true;
    pending.forEach(entry => {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
        const elapsed = performance.now() - entry.startedAt;
        entry.remaining = Math.max(0, entry.remaining - elapsed);
      }
    });
    if (audio) audio.pause();
  }

  function resumeAll() {
    if (!paused) return;
    paused = false;
    pending.forEach(entry => { if (!entry.timer) scheduleEntry(entry); });
    if (audio) audio.play().catch(() => {});
  }

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TYPE_IN  = REDUCED ? 0 : 45;
  const TYPE_OUT = REDUCED ? 0 : 22;

  // ---------------------------------------------------------------------
  // Music — autoplay with graceful fallback to first user gesture.
  // ---------------------------------------------------------------------
  const audio = $('#music');
  let musicArmed = false;

  function tryPlay() {
    if (!audio) return;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.catch(() => {
        if (musicArmed) return;
        musicArmed = true;
        const arm = () => {
          audio.play().catch(() => {});
          ['pointerdown','click','keydown','touchstart','pointermove','scroll','wheel']
            .forEach(ev => window.removeEventListener(ev, arm, { passive: true }));
        };
        ['pointerdown','click','keydown','touchstart','pointermove','scroll','wheel']
          .forEach(ev => window.addEventListener(ev, arm, { passive: true, once: true }));
      });
    }
  }

  let fadeId = 0;
  function fadeMusic(targetVol, durMs) {
    if (!audio) return Promise.resolve();
    const myId = ++fadeId;
    return new Promise(resolve => {
      const v0 = audio.volume;
      let elapsed = 0;
      let last = performance.now();
      const tick = () => {
        if (myId !== fadeId) { resolve(); return; }
        const now = performance.now();
        if (!paused) elapsed += now - last;
        last = now;
        const t = Math.min(1, elapsed / durMs);
        audio.volume = v0 + (targetVol - v0) * t;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }

  // ---------------------------------------------------------------------
  // Typewriter
  // ---------------------------------------------------------------------

  // Plain text type-in (extends, never replaces, so we can append to a line).
  async function type(el, text, speed = TYPE_IN) {
    el.classList.add('is-typing');
    try {
      if (REDUCED) { el.append(text); return; }
      for (const ch of text) {
        el.append(ch);
        await sleep(speed);
      }
    } finally {
      el.classList.remove('is-typing');
    }
  }

  // Rich type-in: segments = [{text, italic?}]
  async function typeRich(el, segments, speed = TYPE_IN) {
    el.classList.add('is-typing');
    try {
      for (const seg of segments) {
        const target = seg.italic ? document.createElement('em') : null;
        if (target) el.appendChild(target);
        const sink = target || el;
        if (REDUCED) {
          sink.append(seg.text);
          continue;
        }
        for (const ch of seg.text) {
          sink.append(ch);
          await sleep(speed);
        }
      }
    } finally {
      el.classList.remove('is-typing');
    }
  }

  // Backspace one element. Walks DOM in reverse so italic <em> nodes are honored.
  async function untype(el, speed = TYPE_OUT) {
    el.classList.add('is-typing');
    try {
      if (REDUCED) { el.textContent = ''; return; }
      while (el.textContent.length > 0) {
        let cur = el;
        while (cur.lastChild) cur = cur.lastChild;
        if (cur.nodeType === Node.TEXT_NODE) {
          cur.data = cur.data.slice(0, -1);
          if (cur.data.length === 0) {
            const parent = cur.parentNode;
            parent.removeChild(cur);
            if (parent !== el && parent.childNodes.length === 0) {
              parent.parentNode.removeChild(parent);
            }
          }
        } else {
          cur.parentNode.removeChild(cur);
          continue;
        }
        await sleep(speed);
      }
    } finally {
      el.classList.remove('is-typing');
    }
  }

  async function untypeAll(els, speed = TYPE_OUT) {
    return Promise.all(els.map(el => untype(el, speed)));
  }

  // ---------------------------------------------------------------------
  // Photo helpers
  // ---------------------------------------------------------------------
  const showPhoto = (el) => el && el.classList.add('is-in');
  const hidePhoto = (el) => el && el.classList.remove('is-in');

  async function fadePhoto(el, durMs = 1400) {
    return new Promise(resolve => {
      const onEnd = () => { el.removeEventListener('transitionend', onEnd); resolve(); };
      el.addEventListener('transitionend', onEnd);
      // Safety timeout in case transitionend doesn't fire
      setTimeout(resolve, durMs + 200);
    });
  }

  // ---------------------------------------------------------------------
  // Scene activation
  // ---------------------------------------------------------------------
  let currentScene = null;
  async function activate(id) {
    const next = $('#' + id);
    if (currentScene) currentScene.classList.remove('is-active');
    next.classList.add('is-active');
    currentScene = next;
    await sleep(700);
  }

  // Convenience: select inside the current scene
  const c = (sel) => $(sel, currentScene);
  const cAll = (sel) => $$(sel, currentScene);

  // ---------------------------------------------------------------------
  // Scenes
  // ---------------------------------------------------------------------

  async function scene1() {
    await activate('s1');

    showPhoto(c('.photo'));
    await sleep(800);
    await type(c('[data-line="meet"]'), 'Meet us in Mexico City.');

    await sleep(5500);

    hidePhoto(c('.photo'));
    await sleep(900);
    await untype(c('[data-line="meet"]'));
    await sleep(400);
  }

  async function scene2() {
    await activate('s2');

    // Pre-baked structure (see index.html): an empty `.line-lead` followed
    // by an opacity-0 `.amor-fade` span. The fade span reserves space so
    // the right-aligned line does not shift when the closing piece appears.
    const lead = c('.line-lead');
    const fade = c('.amor-fade');

    await type(lead, 'For a weekend celebrating');

    // 1s beat, then "amor ♥" and the photo fade in together.
    await sleep(1000);
    requestAnimationFrame(() => {
      fade.classList.add('is-in');
      showPhoto(c('.photo'));
    });

    // Wait for the amor fade to complete (2s).
    await sleep(2000);
    await sleep(5500);

    // Exit: fade text and photo out together, then backspace the lead-in.
    fade.classList.remove('is-in');
    hidePhoto(c('.photo'));
    await sleep(2000);

    await untype(lead);
    await sleep(900);
  }

  async function scene3() {
    await activate('s3');

    const dDate = c('[data-line="d-date"]');
    const dFri  = c('[data-line="d-fri"]');
    const dSat  = c('[data-line="d-sat"]');
    const dSun  = c('[data-line="d-sun"]');

    await type(dDate, 'February 19 to 21, 2027.');
    await sleep(400);
    showPhoto(c('.photo'));
    await sleep(700);

    await type(dFri, 'Friday. Welcome dinner.');
    await sleep(900);

    await type(dSat, 'Saturday. Haldi + Saatak.');
    await sleep(900);

    await type(dSun, 'Sunday. Wedding + Reception.');

    await sleep(5500);

    await untypeAll([dSun, dSat, dFri, dDate], 16);
    await sleep(300);
    hidePhoto(c('.photo'));
    await sleep(800);
  }

  async function scene4() {
    await activate('s4');

    const lQ = c('[data-line="why-q"]');
    const l1 = c('[data-line="why-1"]');
    const l2 = c('[data-line="why-2"]');
    const l3 = c('[data-line="why-3"]');
    const l4 = c('[data-line="why-4"]');
    const l5 = c('[data-line="why-5"]');

    const FAST = REDUCED ? 0 : 28;

    await type(lQ, 'We chose Mexico City for…', FAST);
    showPhoto(c('.photo'));
    await sleep(1000);

    await type(l1, 'the vibrant energy,', FAST);
    await type(l2, 'the food (yes, even Indian food),', FAST);
    await type(l3, 'and the cinematic beauty.', FAST);
    await sleep(1000);

    await type(l4, 'A magical place to celebrate with everyone we love.', FAST);
    await sleep(1000);

    await typeRich(l5, [
      { text: 'Also… ' },
      { text: 'por qué no,', italic: true }
    ], FAST);
    await sleep(600);
    await typeRich(l5, [
      { text: ' amigo?', italic: true }
    ], FAST);

    await sleep(7000);

    await untypeAll([l5, l4, l3, l2, l1, lQ], 10);
    await sleep(300);
    hidePhoto(c('.photo'));
    await sleep(900);
  }

  async function scene6() {
    await activate('s6');

    await type(c('[data-line="form-q"]'), 'Want our plans and CDMX recs?');
    await sleep(500);
    showPhoto(c('.photo'));
    await sleep(800);

    const fields = cAll('.field');
    for (const f of fields) {
      f.classList.add('is-in');
      await sleep(500);
    }
    c('.actions').classList.add('is-in');

    // Wait for submission OR navigation abort
    const form = c('#rsvp');
    const intent = await new Promise((resolve, reject) => {
      const signal = abortCtl ? abortCtl.signal : null;

      const onSubmit = (e) => {
        e.preventDefault();
        const action = (e.submitter && e.submitter.dataset.action) || 'yes';
        if (action === 'yes') {
          const name  = form.elements.name.value.trim();
          const email = form.elements.email.value.trim();
          if (!name || !email) { form.elements.name.focus(); return; }
        }
        const data = {
          intent: action,
          name:    form.elements.name.value.trim(),
          email:   form.elements.email.value.trim(),
          phone:   form.elements.phone.value.trim(),
          address: form.elements.address.value.trim()
        };
        window.__rsvp = data;
        cleanup();
        $$('input, button', form).forEach(el => el.setAttribute('disabled', 'true'));
        resolve(data);
      };

      const onAbort = () => { cleanup(); reject(ABORT); };

      function cleanup() {
        form.removeEventListener('submit', onSubmit);
        if (signal) signal.removeEventListener('abort', onAbort);
      }

      form.addEventListener('submit', onSubmit);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });

    // Fade form away
    await sleep(800);
    c('.actions').classList.remove('is-in');
    cAll('.field').forEach(f => f.classList.remove('is-in'));
    await sleep(700);
    await untype(c('[data-line="form-q"]'));
    hidePhoto(c('.photo'));
    await sleep(800);

    return intent;
  }

  async function scene7() {
    await activate('s7');
    showPhoto(c('.photo'));

    const t1 = c('[data-line="t-1"]');
    const t2 = c('[data-line="t-2"]');
    const t3 = c('[data-line="t-3"]');
    const t4 = c('[data-line="t-4"]');
    const t5 = c('[data-line="t-5"]');

    await type(t1, "Thank you. We'll keep you in the loop.");
    await sleep(700);
    await type(t2, 'February 19 to 21, 2027. Plan to fly in Thursday or Friday morning.');
    await sleep(700);
    await type(t3, 'Hotel block and transportation will be arranged.');
    await sleep(700);
    await type(t4, 'Formal invitation arrives in late summer.');
    await sleep(900);
    await type(t5, 'K + A.');

    // Typing is done — let the moment land, then fade the music out.
    // Volume goes to 0 but playback continues so back-navigation can
    // fade it back up.
    await sleep(1200);
    fadeMusic(0, 5000);

    // Hold the scene indefinitely. The sleep is aborted if the user
    // navigates back to a previous scene; otherwise the final frame stays
    // on screen.
    await sleep(86400000);
  }

  // ---------------------------------------------------------------------
  // Navigation: prev / next
  // ---------------------------------------------------------------------
  const scenes = [scene1, scene2, scene3, scene4, scene6, scene7];
  const sceneIds = ['s1','s2','s3','s4','s6','s7'];
  let currentIndex = 0;

  // Snapshot every `.line` element's initial innerHTML at boot so the
  // pre-baked structure on the amor line (lead + fade span) survives a
  // reset. Bare lines snapshot as "" and get cleared as before.
  const lineSnapshot = new Map();
  $$('.line').forEach(el => lineSnapshot.set(el, el.innerHTML));
  // Also snapshot any nested ".amor-fade" so resets put it back to opacity 0.
  function resetScene(idx) {
    const scene = $('#' + sceneIds[idx]);
    if (!scene) return;
    $$('.line', scene).forEach(el => {
      el.innerHTML = lineSnapshot.get(el) || '';
      el.classList.remove('is-typing');
    });
    $$('.line-lead, .amor-fade', scene).forEach(el => el.classList.remove('is-typing', 'is-in'));
    $$('.photo', scene).forEach(el => el.classList.remove('is-in'));
    $$('.field, .actions', scene).forEach(el => el.classList.remove('is-in'));
    $$('input, button[type="submit"]', scene).forEach(el => el.removeAttribute('disabled'));
  }

  function updateNavButtons() {
    const prevBtn = $('#prev');
    const nextBtn = $('#next');
    if (prevBtn) prevBtn.toggleAttribute('disabled', currentIndex === 0);
    if (nextBtn) nextBtn.toggleAttribute('disabled', currentIndex >= scenes.length - 1);
  }

  function nav(delta) {
    const target = currentIndex + delta;
    if (target < 0 || target >= scenes.length) return;
    currentIndex = target;
    if (paused) {
      // Unpause when navigating so the new scene can run.
      const ctrl = $('#control');
      if (ctrl) {
        ctrl.dataset.state = 'playing';
        ctrl.setAttribute('aria-label', 'Pause');
      }
      resumeAll();
    }
    if (abortCtl) abortCtl.abort();
  }

  // ---------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------
  async function run() {
    if (audio) audio.volume = 0;
    tryPlay();
    fadeMusic(0.55, 6000);

    while (currentIndex < scenes.length) {
      abortCtl = new AbortController();
      const idx = currentIndex;
      updateNavButtons();

      // If the user navigated back from a scene where music had been fading
      // down (the final thank-you scene, now at index 5), restore volume.
      if (idx < scenes.length - 1 && audio && audio.volume < 0.4) {
        fadeMusic(0.55, 1500);
      }

      try {
        await scenes[idx]();
        // Auto-advance only on natural completion (user didn't navigate).
        if (currentIndex === idx) currentIndex++;
      } catch (err) {
        if (err !== ABORT) {
          console.error('Slideshow error:', err);
          return;
        }
        // Aborted via prev/next — currentIndex was updated by `nav`.
      }
      resetScene(idx);
    }

    updateNavButtons();
  }

  // ---------------------------------------------------------------------
  // Controls wiring
  // ---------------------------------------------------------------------
  function bindControls() {
    const ctrl = $('#control');
    if (ctrl) {
      ctrl.addEventListener('click', () => {
        if (paused) {
          resumeAll();
          ctrl.dataset.state = 'playing';
          ctrl.setAttribute('aria-label', 'Pause');
        } else {
          pauseAll();
          ctrl.dataset.state = 'paused';
          ctrl.setAttribute('aria-label', 'Play');
        }
      });
    }

    const prevBtn = $('#prev');
    if (prevBtn) prevBtn.addEventListener('click', () => nav(-1));

    const nextBtn = $('#next');
    if (nextBtn) nextBtn.addEventListener('click', () => nav(+1));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindControls(); run(); });
  } else {
    bindControls();
    run();
  }
})();
