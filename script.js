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
  // Music — starts silently via autoplay+muted; unmutes on first input
  // or via the top-right toggle. Toggle reflects on/off state.
  // ---------------------------------------------------------------------
  const audio = $('#music');
  if (audio) {
    audio.addEventListener('error', () =>
      console.warn('[K+A] Audio failed to load. Place cerca-de-ti.mp3 in assets/.')
    , { once: true });
  }
  const audioToggle = $('#audio-toggle');
  let firstUnmuteDone = false;

  function setToggle(state) {
    if (audioToggle) {
      audioToggle.dataset.state = state;
      audioToggle.setAttribute('aria-label', state === 'on' ? 'Mute audio' : 'Unmute audio');
    }
  }

  function unmuteMusic() {
    if (!audio) return;
    audio.muted = false;
    if (!paused) audio.play().catch(() => {});
    if (!firstUnmuteDone) {
      firstUnmuteDone = true;
      fadeMusic(0.55, 1200);
    } else {
      audio.volume = 0.55;
    }
    setToggle('on');
  }

  function muteMusic() {
    if (!audio) return;
    audio.muted = true;
    setToggle('off');
  }

  function startMusic() {
    if (!audio) return;

    if (audio.muted) {
      // No user gesture has happened yet — keep silent and wait for one.
      audio.volume = 0.55;
      audio.play().catch(() => {});
      setToggle('on');

      const events = ['pointerdown','pointermove','mousemove','click','keydown','touchstart','wheel','scroll'];
      const onFirstInput = () => {
        events.forEach(ev => document.removeEventListener(ev, onFirstInput, true));
        if (!firstUnmuteDone) unmuteMusic();
      };
      events.forEach(ev => document.addEventListener(ev, onFirstInput, { capture: true, passive: true }));
    } else {
      // The cover click already unmuted us; fade up from 0.
      firstUnmuteDone = true;
      audio.play().catch(() => {});
      fadeMusic(0.55, 1200);
      setToggle('on');
    }

    if (audioToggle) {
      audioToggle.addEventListener('click', () => {
        if (audio.muted) unmuteMusic();
        else muteMusic();
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

  // Fade an element out, then clear its content. Replaces the old
  // character-by-character backspace.
  async function untype(el, durMs = 1400) {
    if (!el) return;
    el.classList.remove('is-typing');
    el.classList.add('is-out');
    if (REDUCED) {
      while (el.firstChild) el.removeChild(el.firstChild);
      el.classList.remove('is-out');
      return;
    }
    await sleep(durMs);
    while (el.firstChild) el.removeChild(el.firstChild);
    el.classList.remove('is-out');
  }

  async function untypeAll(els, durMs = 1400) {
    return Promise.all(els.map(el => untype(el, durMs)));
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

    const lead = c('.line-lead');
    const fade = c('.city-fade');

    await type(lead, 'Meet us in');

    await sleep(1000);
    requestAnimationFrame(() => {
      fade.classList.add('is-in');
      showPhoto(c('.photo'));
    });

    await sleep(2000);
    captureSceneSnapshot(0);
    await sleep(3500);

    fade.classList.remove('is-in');
    fade.classList.add('is-out');
    hidePhoto(c('.photo'));
    await untype(lead);
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
    captureSceneSnapshot(1);
    await sleep(2500);

    // Exit: fade lead-in, amor and photo simultaneously.
    fade.classList.remove('is-in');
    fade.classList.add('is-out');
    hidePhoto(c('.photo'));
    await untype(lead);
    await sleep(900);
  }

  async function scene3() {
    await activate('s3');

    const dDate = c('[data-line="d-date"]');
    const dFri  = c('[data-line="d-fri"]');
    const dSat  = c('[data-line="d-sat"]');
    const dSun  = c('[data-line="d-sun"]');

    showPhoto(c('.photo'));
    await sleep(900);

    await type(dDate, 'February 19 to 21, 2027.');
    await sleep(1100);

    await type(dFri, 'Friday. Welcome dinner.');
    await sleep(500);

    await type(dSat, 'Saturday. Haldi + Saatak.');
    await sleep(500);

    await type(dSun, 'Sunday. Wedding + Reception.');

    captureSceneSnapshot(2);

    await sleep(5500);

    hidePhoto(c('.photo'));
    await untypeAll([dSun, dSat, dFri, dDate]);
    await sleep(800);
  }

  async function scene4() {
    await activate('s4');

    const lQ = c('[data-line="why-q"]');
    const l1 = c('[data-line="why-1"]');
    const l2 = c('[data-line="why-2"]');
    const l3 = c('[data-line="why-3"]');
    const l5 = c('[data-line="why-5"]');

    const SLOW = REDUCED ? 0 : 60;

    showPhoto(c('.photo'));
    await sleep(900);

    await type(lQ, 'We chose Mexico City for…', SLOW);
    await sleep(700);

    await type(l1, 'the vibrant energy,', SLOW);
    await sleep(700);
    await type(l2, 'the food (yes, even Indian food),', SLOW);
    await sleep(700);
    await type(l3, 'and the cinematic beauty.', SLOW);
    await sleep(900);

    await typeRich(l5, [
      { text: 'Also… ' },
      { text: 'por qué no,', italic: true }
    ], SLOW);
    await sleep(600);
    await typeRich(l5, [
      { text: ' amigo?', italic: true }
    ], SLOW);

    captureSceneSnapshot(3);

    await sleep(7000);

    hidePhoto(c('.photo'));
    await untypeAll([l5, l3, l2, l1, lQ]);
    await sleep(900);
  }

  async function scene6() {
    await activate('s6');

    await type(c('[data-line="form-q"]'), 'Please give us your contact info for formal invitations.');
    await sleep(500);
    showPhoto(c('.photo'));
    await sleep(800);

    const fields = cAll('.field');
    for (const f of fields) {
      f.classList.add('is-in');
      await sleep(500);
    }

    // Submit is gated by the .is-locked class — only reveal when both
    // required fields have content.
    const form    = c('#rsvp');
    const actions = c('.actions');
    const nameEl  = form.elements.name;
    const emailEl = form.elements.email;

    const refreshSubmit = () => {
      const ok = nameEl.value.trim() && emailEl.value.trim();
      if (ok) {
        actions.classList.remove('is-locked');
        actions.classList.add('is-in');
      } else {
        actions.classList.remove('is-in');
        actions.classList.add('is-locked');
      }
    };
    nameEl.addEventListener('input', refreshSubmit);
    emailEl.addEventListener('input', refreshSubmit);
    refreshSubmit();

    // Wait for submission OR navigation abort
    const intent = await new Promise((resolve, reject) => {
      const signal = abortCtl ? abortCtl.signal : null;

      const onSubmit = (e) => {
        e.preventDefault();
        const name  = form.elements.name.value.trim();
        const email = form.elements.email.value.trim();
        if (!name) { nameEl.focus(); return; }
        if (!email) { emailEl.focus(); return; }
        const data = {
          name,
          email,
          phone:      form.elements.phone.value.trim(),
          address:    form.elements.address.value.trim(),
          optInRecs:  form.elements.recs.checked
        };
        window.__rsvp = data;
        cleanup();
        $$('input, button', form).forEach(el => el.setAttribute('disabled', 'true'));
        resolve(data);
      };

      const onAbort = () => { cleanup(); reject(ABORT); };

      function cleanup() {
        form.removeEventListener('submit', onSubmit);
        nameEl.removeEventListener('input', refreshSubmit);
        emailEl.removeEventListener('input', refreshSubmit);
        if (signal) signal.removeEventListener('abort', onAbort);
      }

      form.addEventListener('submit', onSubmit);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });

    captureSceneSnapshot(4);

    // Fade form away — photo, fields, actions, and form-q all together.
    await sleep(800);
    c('.actions').classList.remove('is-in');
    cAll('.field').forEach(f => f.classList.remove('is-in'));
    hidePhoto(c('.photo'));
    await untype(c('[data-line="form-q"]'));
    await sleep(800);

    return intent;
  }

  async function scene7() {
    await activate('s7');

    showPhoto(c('.photo'));

    const t2a = c('[data-line="t-2a"]');
    const t2b = c('[data-line="t-2b"]');
    const t3  = c('[data-line="t-3"]');
    const t4  = c('[data-line="t-4"]');
    const t6  = c('[data-line="t-6"]');
    const t5  = c('[data-line="t-5"]');

    await type(t2a, 'February 19 to 21, 2027.');
    await sleep(300);
    await type(t2b, 'Plan to fly in Thursday or Friday morning.');
    await sleep(800);
    await type(t3, 'Hotel block and transportation will be arranged.');
    await sleep(800);
    await type(t4, 'Formal invitation arrives in late summer.');
    await sleep(900);
    await type(t6, 'We hope to see you in Mexico City.');
    await sleep(900);
    await type(t5, 'Kajal + Adarsh');

    captureSceneSnapshot(5);

    // Typing is done — let the moment land, then fade the music out.
    // Volume goes to 0 but playback continues so back-navigation can
    // fade it back up.
    await sleep(1200);
    fadeMusic(0, 5000);

    // Hold; user can advance to the logo finale via the next arrow.
    await sleep(86400000);
  }

  async function scene8() {
    await activate('s8');
    const logo = c('.logo-mark');
    if (logo) logo.classList.add('is-in');
    await sleep(1400);
    captureSceneSnapshot(6);

    // If music is still up (user skipped scene 7 quickly), fade it out here.
    if (audio && audio.volume > 0.05) fadeMusic(0, 3000);

    await sleep(86400000);
  }

  // ---------------------------------------------------------------------
  // Navigation: prev / next
  // ---------------------------------------------------------------------
  const scenes = [scene1, scene2, scene3, scene4, scene6, scene7, scene8];
  const sceneIds = ['s1','s2','s3','s4','s6','s7','s8'];
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
      el.classList.remove('is-typing', 'is-out');
    });
    $$('.line-lead, .amor-fade, .city-fade', scene).forEach(el => el.classList.remove('is-typing', 'is-in', 'is-out'));
    $$('.photo', scene).forEach(el => el.classList.remove('is-in'));
    $$('.field, .actions', scene).forEach(el => el.classList.remove('is-in'));
    $$('.actions--single', scene).forEach(el => el.classList.add('is-locked'));
    $$('input, button[type="submit"]', scene).forEach(el => el.removeAttribute('disabled'));
    $$('input[type="text"], input[type="email"], input[type="tel"]', scene).forEach(el => { el.value = ''; });
    $$('input[type="checkbox"]', scene).forEach(el => { el.checked = false; });
    $$('.logo-mark', scene).forEach(el => el.classList.remove('is-in'));
  }

  // Per-play snapshots: capture each scene's DOM at peak visibility so a
  // back-nav restores final state instead of replaying typewriter + fades.
  const snapshots = new Map();

  function captureSceneSnapshot(idx) {
    const scene = $('#' + sceneIds[idx]);
    if (!scene) return;
    const snap = { lines: [], lead: null, photoIn: false, decoIn: [], fieldsIn: false, actionsIn: false, formValues: null };

    $$('.line', scene).forEach(el => {
      if (el.dataset.line) snap.lines.push([el.dataset.line, el.innerHTML]);
    });
    const lead = $('.line-lead', scene);
    if (lead) snap.lead = lead.innerHTML;

    const photo = $('.photo', scene);
    if (photo) snap.photoIn = photo.classList.contains('is-in');

    $$('.city-fade, .amor-fade', scene).forEach(el => {
      const cls = el.classList.contains('city-fade') ? 'city-fade' : 'amor-fade';
      snap.decoIn.push([cls, el.classList.contains('is-in')]);
    });

    const fields = $$('.field', scene);
    if (fields.length) snap.fieldsIn = fields.every(f => f.classList.contains('is-in'));
    const actions = $('.actions', scene);
    if (actions) snap.actionsIn = actions.classList.contains('is-in');
    if (window.__rsvp) snap.formValues = { ...window.__rsvp };

    snapshots.set(idx, snap);
  }

  function restoreSceneSnapshot(idx) {
    const snap = snapshots.get(idx);
    if (!snap) return false;
    const scene = $('#' + sceneIds[idx]);
    if (!scene) return false;

    scene.classList.add('is-restoring');

    snap.lines.forEach(([dataLine, html]) => {
      const el = $(`[data-line="${dataLine}"]`, scene);
      if (el) { el.innerHTML = html; el.classList.remove('is-typing', 'is-out'); }
    });
    if (snap.lead !== null) {
      const lead = $('.line-lead', scene);
      if (lead) { lead.innerHTML = snap.lead; lead.classList.remove('is-typing', 'is-out'); }
    }

    const photo = $('.photo', scene);
    if (photo) { photo.classList.toggle('is-in', snap.photoIn); photo.classList.remove('is-out'); }

    snap.decoIn.forEach(([cls, isIn]) => {
      const el = $('.' + cls, scene);
      if (el) { el.classList.toggle('is-in', isIn); el.classList.remove('is-out', 'is-typing'); }
    });

    if (snap.fieldsIn) $$('.field', scene).forEach(f => f.classList.add('is-in'));
    const actions = $('.actions', scene);
    if (actions) { actions.classList.toggle('is-in', snap.actionsIn); actions.classList.remove('is-locked'); }
    if (snap.formValues) {
      const form = $('#rsvp', scene);
      if (form) {
        form.elements.name.value    = snap.formValues.name    || '';
        form.elements.email.value   = snap.formValues.email   || '';
        form.elements.phone.value   = snap.formValues.phone   || '';
        form.elements.address.value = snap.formValues.address || '';
        form.elements.recs.checked  = !!snap.formValues.optInRecs;
        $$('input, button', form).forEach(el => el.setAttribute('disabled', 'true'));
      }
    }

    const logo = $('.logo-mark', scene);
    if (logo) logo.classList.add('is-in');

    // Force reflow so the property writes commit without transition, then
    // drop the is-restoring class on the next frame.
    void scene.offsetWidth;
    requestAnimationFrame(() => scene.classList.remove('is-restoring'));
    return true;
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
    startMusic();

    while (currentIndex < scenes.length) {
      abortCtl = new AbortController();
      const idx = currentIndex;
      updateNavButtons();

      // If the user navigated back from a scene where music had been fading
      // down (the final thank-you scene, now at index 5), restore volume.
      if (idx < scenes.length - 1 && audio && audio.volume < 0.4) {
        fadeMusic(0.55, 1500);
      }

      // Already played to completion — restore final state and hold for next nav.
      if (snapshots.has(idx)) {
        try {
          await activate(sceneIds[idx]);
          restoreSceneSnapshot(idx);
          await sleep(86400000);
        } catch (err) {
          if (err !== ABORT) {
            console.error('Slideshow error:', err);
            return;
          }
        }
        continue;
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

  function bindCover() {
    const cover = $('#cover');
    const playBtn = $('#cover-play');
    if (!cover || !playBtn) { run(); return; }
    document.body.classList.add('is-cover');

    const pwForm  = $('#cover-password');
    const pwInput = $('#cover-pw-input');
    const pwError = $('#cover-pw-error');
    if (pwForm && pwInput) {
      pwForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (pwInput.value.trim().toLowerCase() === 'cdmx') {
          pwForm.classList.add('is-out');
          playBtn.classList.remove('is-hidden');
          playBtn.focus();
        } else {
          pwInput.value = '';
          if (pwError) pwError.textContent = 'Incorrect password.';
          pwInput.focus();
        }
      });
    }

    playBtn.addEventListener('click', () => {
      if (audio) {
        audio.muted = false;
        audio.volume = 0;
        audio.play().catch(() => {});
      }
      cover.classList.add('is-out');
      const cleanup = () => {
        cover.removeEventListener('transitionend', cleanup);
        if (cover.parentNode) cover.parentNode.removeChild(cover);
        document.body.classList.remove('is-cover');
      };
      cover.addEventListener('transitionend', cleanup);
      setTimeout(cleanup, 1000);
      run();
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindControls(); bindCover(); });
  } else {
    bindControls();
    bindCover();
  }
})();
