# wedding

Save-the-date for K + A · CDMX 2027.

A self-running cinematic slideshow. No scroll, no click. The page loads, music fades in, scenes auto-advance with typewriter and photo-fade animations, the form pauses for input, then the closing scene plays.

## Run locally

```bash
python3 -m http.server 8080
# visit http://localhost:8080
```

Opening `index.html` directly via `file://` works for the visuals but some browsers block audio that way.

## Audio

The bed track ("Cerca de Ti" by Hermanos Gutiérrez) is gitignored. Drop a licensed copy at one of:

- `assets/cerca-de-ti.m4a`
- `assets/cerca-de-ti.mp3`

The page is silent without it.

## Files

- `index.html` — scene markup
- `tokens.css` — design tokens (one color, one size, one weight)
- `styles.css` — slideshow stage, per-scene layout, cursor, form
- `script.js` — slideshow engine (typewriter, photo fades, audio fader, form gate)
- `design-system.md` — design system reference
- `assets/` — photos
