# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. Open `index.html` directly in a browser, or serve it with any static file server:

```
npx serve .
# or
python3 -m http.server
```

## Architecture

Three files, no dependencies installed locally:

- **`index.html`** — two-panel layout: left form (`#cv-form`) and right live preview (`#resume-preview`). Loads jsPDF from a CDN (`cdnjs.cloudflare.com`).
- **`styles.css`** — CSS custom properties on `:root` for all colors, shadows, and radii. Responsive: single-column below 860 px.
- **`app.js`** — single IIFE, no framework. Three concerns wired together:
  1. **Live preview**: `form` `input` event → `updateResume()` reflects field values into `#preview-*` elements using `textContent` (no innerHTML).
  2. **Persistence**: every keystroke saves raw field values to `localStorage` under the key `cv-maker-draft`; restored on page load.
  3. **PDF export**: `buildPdf()` uses `window.jspdf.jsPDF` (loaded from CDN) to render an A4 document with manual `y`-coordinate layout and automatic page breaks.

The preview and PDF both fall back to `PLACEHOLDERS` when a field is empty.
