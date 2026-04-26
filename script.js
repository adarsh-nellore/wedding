/* =========================================================================
   K + A · CDMX 2027 — Slideshow engine
   Auto-starts on DOMContentLoaded. No scroll. No click-to-begin.
   ========================================================================= */

(() => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

  function fadeMusic(targetVol, durMs) {
    if (!audio) return Promise.resolve();
    return new Promise(resolve => {
      const start = performance.now();
      const v0 = audio.volume;
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / durMs);
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
    if (REDUCED) { el.append(text); el.classList.remove('is-typing'); return; }
    for (const ch of text) {
      el.append(ch);
      await sleep(speed);
    }
    el.classList.remove('is-typing');
  }

  // Rich type-in: segments = [{text, italic?}]
  async function typeRich(el, segments, speed = TYPE_IN) {
    el.classList.add('is-typing');
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
    el.classList.remove('is-typing');
  }

  // Backspace one element. Walks DOM in reverse so italic <em> nodes are honored.
  async function untype(el, speed = TYPE_OUT) {
    el.classList.add('is-typing');
    if (REDUCED) { el.textContent = ''; el.classList.remove('is-typing'); return; }
    while (el.textContent.length > 0) {
      // Find the deepest last text node
      let cur = el;
      while (cur.lastChild) cur = cur.lastChild;
      if (cur.nodeType === Node.TEXT_NODE) {
        cur.data = cur.data.slice(0, -1);
        if (cur.data.length === 0) {
          const parent = cur.parentNode;
          parent.removeChild(cur);
          // Clean up empty <em>
          if (parent !== el && parent.childNodes.length === 0) {
            parent.parentNode.removeChild(parent);
          }
        }
      } else {
        // Empty element — remove it
        cur.parentNode.removeChild(cur);
        continue;
      }
      await sleep(speed);
    }
    el.classList.remove('is-typing');
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

    // Text first
    await typeRich(c('[data-line="amor"]'), [
      { text: 'For a weekend celebrating ', italic: false },
      { text: 'amor <3', italic: true }
    ]);

    await sleep(500);

    // Then bg photo slides in from the left
    showPhoto(c('.photo'));
    await sleep(5500);

    await untype(c('[data-line="amor"]'));
    await sleep(400);
    hidePhoto(c('.photo'));
    await sleep(900);
  }

  async function scene3() {
    await activate('s3');

    const dDate = c('[data-line="d-date"]');
    const dFri  = c('[data-line="d-fri"]');
    const dSat  = c('[data-line="d-sat"]');
    const dSun  = c('[data-line="d-sun"]');

    await type(dDate, 'February 19 to 21, 2027.');
    await sleep(900);

    await type(dFri, 'Friday.');
    await sleep(1000);
    await type(dFri, ' Welcome.');
    await sleep(900);

    await type(dSat, 'Saturday.');
    await sleep(1000);
    await type(dSat, ' Wedding.');
    await sleep(900);

    await type(dSun, 'Sunday.');
    await sleep(1000);
    await type(dSun, ' Brunch.');

    await sleep(5500);

    await untypeAll([dSun, dSat, dFri, dDate], 16);
    await sleep(400);
  }

  async function scene4() {
    await activate('s4');

    const lQ = c('[data-line="why-q"]');
    const l1 = c('[data-line="why-1"]');
    const l2 = c('[data-line="why-2"]');
    const l3 = c('[data-line="why-3"]');
    const l4 = c('[data-line="why-4"]');

    await type(lQ, 'Why Mexico City?');
    await sleep(400);
    showPhoto(c('.photo'));
    await sleep(900);

    await type(l1, 'Vibrant energy.');
    await sleep(700);
    await type(l2, 'Incredible food.');
    await sleep(700);
    await type(l3, 'Cinematic setting.');
    await sleep(700);
    await typeRich(l4, [{ text: 'And also, por qué no?', italic: true }]);

    await sleep(6500);

    await untypeAll([l4, l3, l2, l1, lQ], 14);
    await sleep(300);
    hidePhoto(c('.photo'));
    await sleep(900);
  }

  async function scene5() {
    await activate('s5');

    showPhoto(c('.photo'));
    await sleep(1000);
    await type(c('[data-line="invite"]'), 'Formal invitation arrives in late summer.');

    await sleep(6000);

    await untype(c('[data-line="invite"]'));
    await sleep(400);
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

    // Wait for submission
    const intent = await new Promise(resolve => {
      const form = c('#rsvp');
      const buttons = $$('.actions button', form);

      const onSubmit = (e) => {
        e.preventDefault();
        const action = e.submitter && e.submitter.dataset.action || 'yes';
        // Light validation only for "yes"
        if (action === 'yes') {
          const name  = form.elements.name.value.trim();
          const email = form.elements.email.value.trim();
          if (!name || !email) {
            // Surface a quiet hint by flashing the labels (no extra UI per design).
            form.elements.name.focus();
            return;
          }
        }
        // Capture data — for now, just keep it on window for later wiring.
        const data = {
          intent: action,
          name:    form.elements.name.value.trim(),
          email:   form.elements.email.value.trim(),
          phone:   form.elements.phone.value.trim(),
          address: form.elements.address.value.trim()
        };
        window.__rsvp = data;
        // Lock UI
        $$('input, button', form).forEach(el => el.setAttribute('disabled', 'true'));
        resolve(data);
      };

      form.addEventListener('submit', onSubmit);
      buttons.forEach(b => b.addEventListener('click', () => {
        // Make submitter explicit for browsers that don't supply it
        b.setAttribute('data-clicked', 'true');
      }));
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

    // Music begins fading out as scene 7 starts.
    fadeMusic(0, 6500).then(() => audio && audio.pause());

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
  }

  // ---------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------
  async function run() {
    try {
      // Music fades in from the very first moment, in parallel with scene 1.
      if (audio) audio.volume = 0;
      tryPlay();
      fadeMusic(0.55, 6000);

      await scene1();
      await scene2();
      await scene3();
      await scene4();
      await scene5();
      await scene6();
      await scene7();
    } catch (err) {
      console.error('Slideshow error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { run(); });
  } else {
    run();
  }
})();
