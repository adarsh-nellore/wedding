# Design System

One color. One size. One weight. One font.

## Color

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#0E0E0E` | Page background. |
| `--fg` | `#EFE7D2` | Every piece of text. Every line. Every input border. The entire foreground palette is this single value. |

There are no accents.

## Type

- **Family:** `latienne-pro` first (the Adobe Fonts face used by casapolanco.com), then `Cormorant Garamond` as the free Google Fonts near-match, with `EB Garamond`, Georgia, and serif as final fallbacks. The site renders Cormorant Garamond by default; if the user ever adds an Adobe Fonts kit license, Latienne Pro will take over with no other change.
- **Weight:** 400. Regular. Never bold. Never light.
- **Size:** 30px. The only size on the site. Headlines, body, form labels, signoff: all 30.
- **Line-height:** 1.35.
- **Letter-spacing:** 0.
- **Italic:** allowed, only for italic content already italic in the PDF (`amor`, `por qué no?`). Italic is still weight 400.

## Layout

- Page is one vertical scroll. Each slide is a `100vh` block with `scroll-snap-align: start`.
- Photos sit at a comfortable max-width (no full-bleed except slide 2). Generous space above and below.
- One column. Text is always left-aligned unless the PDF dictates otherwise (slide 5 centered, slide 2 bottom-right).
- Side margins: `clamp(24px, 6vw, 96px)`.

## Motion

- Single transition: `opacity 1200ms cubic-bezier(0.2, 0.7, 0.2, 1)` on slide enter.
- No translate, no scale, no parallax, no glow, no aurora.
- `prefers-reduced-motion: reduce` removes even the fade.

## Sequencing (this is a slideshow, not a scrollable site)

The page is a single fixed viewport. The guest does not scroll. Seven scenes auto-advance, driven by an async engine in `script.js`.

- **Auto-start:** the sequence begins on `DOMContentLoaded`. There is no Begin button.
- **Per-scene shape:** every scene is `enter sequence` → `hold` → `exit sequence`, then the next scene activates.
- **Typewriter:** every line of text appears character-by-character (45ms/char in) and disappears character-by-character (22ms/char out). Italic ranges live inside `<em>` and are typed/untyped along with the rest of the line. While a line is typing, a 2px cursor blinks at its tail.
- **Photos:** fade 0 → 1 over 1400ms. Scene 2's photo also slides in 40px from the left.
- **Pauses:** within a scene, day pairs ("Friday." / "Welcome.") wait ~1s between halves. Lines in a list ("Vibrant energy." → "Incredible food.") wait ~700ms. End-of-scene holds run 5.5–6.5s so guests can read.
- **Form scene (s6):** the engine pauses and waits for a submit. After the guest picks "Yes, please." or "No, but save my info.", their data is captured to `window.__rsvp` and the engine advances.
- **Music:** "Cerca de Ti" by Hermanos Gutiérrez. Lives at `assets/cerca-de-ti.mp3`. Fades 0 → 0.55 over 4.5s on scene 1; fades back to 0 over 6.5s on scene 7. Browser autoplay policies may delay playback to the first incidental user gesture; the engine handles that fallback transparently — animations never wait on audio.

## Banned

- Bold, light, extralight, semibold. Anything but 400.
- Multiple font sizes. There is one.
- Accent colors. The cream is the whole palette.
- Eyebrows, pre-headlines, kicker labels, "save the date" tags, scroll hints, side rails, signature marks.
- Em dashes (project rule).
- Drop shadows, glows, gradients, neon halos.
