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

Three files, no dependencies installed locally. jsPDF 2.5.1 is loaded from CDN at the bottom of `index.html`.

### `app.js` — single IIFE, no framework

**Data flow**: every `input` event on `#cv-form` (including bubbled events from dynamically added cards) calls `handleInput()`, which runs `saveToLocalStorage()` then `updateResume()`.

**Two data-access functions** serve different purposes:
- `getValues()` — trimmed, display-ready; filters out blank repeatable cards. Used for preview rendering and PDF.
- `getRawValues()` — exact form state including empty cards. Used only for `localStorage` persistence.

**Repeatable sections** (experience, education, languages) follow a consistent pattern:
- DOM cards use `data-field` attributes (e.g. `data-field="company"`) on inputs; `collect*FromDOM()` reads them.
- Remove buttons use `data-action="remove-experience"` (etc.); list click handlers delegate on that attribute.
- `render*List()` always replaces children (via `replaceChildren()`); never mutates existing cards.
- Removing the last card resets to one empty card rather than leaving the list empty.

**localStorage** key is `cv-maker-draft`. Stored shape: `{ name, title, contact, summary, skills (string), hobbies (string), fontFamily, experience[], education[], languages[] }`. `parseStoredExperience` handles legacy drafts where `experience` was a plain string.

**Font system**: three keys (`sans`, `serif`, `mono`) each map to a CSS font stack (applied as `--resume-font` on `#resume-preview`) and a jsPDF font name. Font is saved in the draft and restored on load.

**A4 preview scaling**: `#resume-preview` is a fixed 420×595 px reference frame. `updatePreviewScale()` computes a `--preview-scale` CSS custom property and applies it via `transform: scale()` so it fits the available `.preview-stage` space. The layout dimensions stay fixed so overflow math remains accurate.

**`.resume-meta-row`** holds three compact side-by-side sections: Skills, Hobbies & Interests, and Languages — all rendered as `skill-badge` lists.

**Overflow detection**: `checkPageOverflow()` compares `scrollHeight` of `#resume-preview-content` against `clientHeight` of `#resume-preview`. Sets `is-overflowing` class on the page and on individual sections that cross the cutoff line. Shows `#page-overflow-warning`. Scheduled via `requestAnimationFrame` (debounced by `scheduleOverflowCheck`).

**PDF export** (`buildPdf`): manual `y`-coordinate layout in mm on A4. `pdfEnsureSpace()` triggers `doc.addPage()` when the next block would overflow. Skills render as a `·`-joined string; languages render one per line.

### `index.html`

Two-panel layout: `.panel-form` (left, `#cv-form`) and `.panel-preview` (right). Preview markup is pre-rendered with placeholder text; `app.js` updates it in place via `textContent` (never `innerHTML` for user data — only for trusted HTML built by `escapeHtml`-wrapped helpers).

### `styles.css`

All colors, shadows, and radii are CSS custom properties on `:root`. Responsive breakpoint at 860 px (single column). Preview scaling uses `--preview-scale` set by JS.
