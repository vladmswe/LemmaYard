# LemmaYard design system v2: "Proof"

The UI source of truth. Every page and component follows this file; if code and this file disagree, fix one of them in the same change. v2 replaced v1 ("Collegiate modern") in October 2026. It keeps v1's structure where it worked: the shadcn token names, the verdict and difficulty semantics, the "status = colour + icon + word" rule and the reading measure for problem statements.

Owner brief: a serious place to learn (a university press, not a game), honest and precise feedback, "small proven steps add up", made with care, blue and trustworthy. English UI. **For now the site is dark only** (§6.5); the light theme stays fully implemented and tested.

Rollout: phase 1 (this foundation) restyled tokens, fonts, Monaco, every shared component, the chrome, the landing page, login/register and the static states. Phase 2 redesigns the catalog, the problem workspace, submissions, profile, the guide and rooms with the pieces below (§13 has their target layouts).

Implementation map:

| What | Where |
|---|---|
| Tokens (light `:root` / dark `.dark`), `@theme inline` mapping, type classes, signature and motion utilities, prose, reduced motion | `src/app/globals.css` |
| Theme switch (dark only / toggle) | `src/lib/theme-config.ts` |
| Fonts (next/font, self-hosted at build) | `src/app/fonts.ts` |
| shadcn primitives (Base UI), themed | `src/components/ui/*` (+ v2 `chip.tsx`, `segmented.tsx`) |
| Verdict / difficulty / problem-status dictionaries | `components/judge/verdict.ts`, `components/problems/difficulty.ts`, `components/problems/problem-status.ts` |
| Status components | `judge/verdict-badge.tsx` (`VerdictBadge`, `VerdictLabel`, `VerdictIcon`), `judge/test-squares.tsx`, `problems/difficulty-badge.tsx` (`DifficultyBadge`, `DifficultyGlyph`), `problems/problem-status-icon.tsx` |
| Signature marks | `brand/logo.tsx`, `brand/qed.tsx`, `brand/qed-loader.tsx`, `layout/section-head.tsx` (`SectionHead`, `SectionNumber`, `ProofGutter`) |
| Motion | `motion/reveal.tsx`, `motion/reveal-observer.tsx`, `motion/count-up.tsx`, `src/lib/motion.ts` |
| Chrome | `site-header.tsx`, `header-nav.tsx`, `header-scroll-state.tsx`, `mobile-menu.tsx`, `user-menu.tsx`, `theme-toggle.tsx`, `site-footer.tsx`, `nav-links.ts` |
| Page pieces | `page-head.tsx`, `empty-state.tsx`, `status-page.tsx`, `not-found-content.tsx`, `page-skeleton.tsx`, `pagination.tsx`, `auth-card.tsx`, `auth-aside.tsx` |
| Landing | `src/app/(site)/page.tsx`, `components/landing/*` (`proof-stage`, `heap-figure`, `progress-preview`, `landing.css`), data `src/server/landing.ts` |
| Monaco themes (plain data, registered by name) | `src/lib/monaco-themes.ts` |
| Contrast check over the real token values (light and dark) | `tests/unit/contrast.test.ts` |
| Design e2e (axe, overflow, forced theme, reduced motion, focus) | `tests/e2e/site/design-v2.spec.ts` |
| Route groups | `src/app/(site)/` = header + footer, `src/app/(workspace)/` = compact header, full height, no footer (problem page) |

---

## 1. Why v2 (the critique of v1, short)

v1 worked as a template but had no idea you would remember: a timid type scale (44px serif hero, ~2.6× body), sections of equal weight on white or pale grey, a stock hero illustration with a 12px "Accepted" pill, a navy masthead heavier than the message, decorative details (gold rule, faint grid, "EXAMPLE" tag) that never built a motif, a generic `< >` logo, stock shadcn cards, an inverted light theme for dark, dead-end empty states, centred auth forms on blank pages and no signature motion. v2 fixes each of these with one idea taken from the product's own name.

## 2. Direction "Proof"

A university press meets a code editor. Paper-white and night-navy, cobalt colour blocks, a condensed editorial serif for display, mono marginalia, hairline proof gutters and the ∎ tombstone. A lemma is a small proven step; every accepted solution is a small proof.

- **Tone:** rigorous, calm, confident, warm-academic, crafted. Not gamified, neon, "hacker" or corporate SaaS.
- **Expressive budget:** landing, hero surfaces, auth, empty states, profile, guide and rooms. The catalog, the workspace and the submission tables stay dense and quiet.
- **Borrowed and rejected trends:** oversized serif display (yes), mono micro-labels and figure numbers (yes), colour blocking (one cobalt and one night block per long page), one asymmetric bento on the landing page only, code and monoline diagrams as illustration (yes), 7% grain on colour blocks only, no blue gradient meshes, no glass or neon glow, no cursor-reactive type, no scroll hijacking.

## 3. Principles

1. **One blue means "act".** `--primary` is for primary buttons, links, focus, the selected nav item, progress and the ∎. Decoration uses `--sky`, `--highlight` and the cobalt scale 300–500, never text.
2. **Serif for display only.** Instrument Serif at 28px and larger: hero, page and section titles, card titles on hero surfaces, the verdict word, large numerals. Everything you scan, type into or compare (tables, forms, buttons, badges, the console body) uses Instrument Sans or JetBrains Mono.
3. **Status = colour + icon/shape + word.** No verdict, difficulty or problem status is shown by colour alone. Difficulty also has a shape (■ ◆ ▲).
4. **Precise, then satisfying.** Things settle fast (expo-out); only the payoff moments (∎, test squares, push) get a small spring. Reduced motion means no movement at all.
5. **Reading first.** Problem statements at 16/26 with a 72ch measure; long content scrolls inside its own pane on the problem page.

## 5. The signature: proof marks

Three marks, used together but each on its own job.

1. **The tombstone ∎** (end of proof). A solid square in `--primary`, 0.4em, as the final "full stop" of one display headline per page (`<Qed />`). Also: the brand mark's core, the Accepted companion in feeds and toasts, the "complete" lesson marker, the loader (`<QedLoader />`, a square that fills bottom-up) and the "unfinished proof" (dashed outline) of empty states and 404.
2. **The proof gutter.** A hairline column of mono numbers (`01 02 03 …`) left of hero areas (`<ProofGutter current={3} />`) and the `§ NN` section number in a 72px gutter column (`--gutter-w`, `<SectionHead n={2} …/>`). The 72px offset is the page's deliberate asymmetry. In code panes it is the real line-number gutter.
3. **Test squares.** One 9px square per test case (`<TestSquares results={["pass","fail","pending"]} />`): filled green = passed, rotated red diamond = failed, outline = not run. Hero, console summary, room scoreboard, profile proof sheet, lesson progress.

Rules:
- At most one ∎ headline per viewport. Never after a question or a sentence that is not a statement.
- Gutters show from 961px. Below, `§ NN` sits above the heading.
- Test squares, ∎ and gutters are decorative (`aria-hidden`). The adjacent text carries the meaning ("12 / 12 passed", "Wrong Answer").

**Logo.** The mark is an L-shaped proof margin (stroke 3/24) holding a 7×7 tombstone, in `currentColor` (primary by default; `text-sky` on night). Wordmark A: Instrument Sans 600, `font-stretch: 92%`, −2.5% tracking (`<Logo />`). A display variant (serif "LemmaYard" + sky ∎) closes the footer. A mono `lemma/yard` variant is reserved for CLI and docs.

## 6. Tokens

Canonical values use the shadcn names in `globals.css` (`:root` = light, `.dark` = dark). The short v2 names (`--bg`, `--surface`, `--sunken`, `--raised`, `--line`, `--line-strong`, `--ink`, `--ink-2`, `--faint`, `--on-primary`, `--primary-soft`, `--on-primary-soft`) are aliases of them, also available as Tailwind colours (`bg-surface`, `bg-raised`, `text-ink`, `text-ink-2`, `border-line`, `bg-primary-soft` …). The v2 "muted" text colour is `--muted-foreground`; `--muted` stays the shadcn surface.

### 6.1 Core (light / dark)
| Token (CSS name) | v2 name | Light | Dark | Role |
|---|---|---|---|---|
| `--background` | bg | `#F4F6FB` | `#060B1C` | page |
| `--card` | surface | `#FFFFFF` | `#0C1430` | cards, panes, table body |
| `--surface-sunken`, `--muted` | sunken | `#EBEFF8` | `#08102A` | IO blocks, tags, workspace canvas |
| `--accent` | | `#EBEFF8` | `#172350` | row hover, menu highlight (dark: lifted so it shows on night) |
| `--popover` | raised | `#FFFFFF` | `#121D40` | popovers, toasts, menus |
| `--border` | line | `#D8DFEE` | `#1F2C55` | hairlines (decorative) |
| `--border-strong` | line-strong | `#AEBAD3` | `#34467A` | secondary-button border, chips, outline squares |
| `--input` | | `#717FA0` | `#6676A3` | field border (4.0:1 on surface) |
| `--foreground` | ink | `#0A1433` | `#EBF0FF` | primary text |
| `--foreground-secondary` | ink-2 | `#2E3B5C` | `#C3CDEA` | lead, descriptions |
| `--muted-foreground` | muted | `#525E7B` | `#9CA9CC` | metadata, table heads |
| `--faint-foreground` | faint | `#5F6B88` | `#8C9ABF` | placeholders, captions (≥ 4.5) |
| `--primary` | primary | `#2340D8` | `#8DA8FF` | action, links, focus, ∎ |
| `--primary-hover` / `--primary-active` | | `#1B32B4` / `#152890` | `#A9BEFF` / `#C4D3FF` | |
| `--primary-foreground` | on-primary | `#FFFFFF` | `#07102F` | text on primary |
| `--secondary` / `--secondary-foreground` | primary-soft / on-primary-soft | `#E3E9FF` / `#16288F` | `#18265A` / `#D4DEFF` | soft button, guide card |
| `--link` / `--link-visited` | | `#1F3BCB` / `#5B3FA8` | `#A0B8FF` / `#C6B5F5` | inline links |
| `--ring` | | `#2340D8` | `#A9BEFF` | focus outline 2px + 2px offset |
| `--cobalt` / `--on-cobalt` / `--on-cobalt-2` | | `#1D36C4` / `#FFF` / `#D3DCFF` | `#1B33BC` / `#FFF` / `#D3DCFF` | colour block |
| `--cobalt-line` | | `#8FA6FF` | `#7F98FF` | rules inside cobalt |
| `--night` / `--on-night` / `--on-night-2` | | `#081130` / `#F1F4FF` / `#B9C5E6` | `#030714` / `#F1F4FF` / `#B3BFE2` | footer, rooms hero, dark blocks |
| `--night-line` | | `#2B3A6B` | `#24325E` | rules inside night (decorative) |
| `--sky` | | `#7FA2FF` | `#8DA8FF` | decorative strokes on cobalt/night, never text on paper |
| `--highlight` | | `#DCE5FF` | `#1D2C66` | marker highlight, selection |
| `--editor-bg` / `--gutter-ink` | | `#FBFCFF` / `#5F6B88` | `#09112A` / `#7F8DB3` | Monaco, code viewers |
| `--tooltip-bg` / `--tooltip-fg` | | `#0A1433` / `#F1F4FF` | `#EBF0FF` / `#0A1433` | inverted tooltip |
| `--destructive` / hover / foreground | | `#C0283A` / `#A11F30` / `#FFF` | `#F27382` / `#F595A1` / `#07102F` | destructive buttons |
| `--header*` | | = bg, ink, ink-2 | | the header is translucent paper (no masthead) |
| `--avatar-bg` / `--avatar-fg` | | = primary-soft pair | | initials avatar |

Brand scale (`@theme`, static, overrides Tailwind's `blue-*`): 50 `#F2F5FF`, 100 `#E3E9FF`, 200 `#C7D3FF`, 300 `#9FB2FF`, 400 `#7F98FF`, 500 `#4A64F0`, 600 `#2340D8`, 700 `#1B32B4`, 800 `#152890`, 900 `#121F6B`, 950 `#081130`. 300–500 are decorative only. `--gold` is removed (the guide's `--viz-frontier` falls back to its own amber).

### 6.2 Semantic, verdicts, difficulty (fg / bg)
| Token | Light | Dark | Icon (lucide) | Label |
|---|---|---|---|---|
| success | `#13733A` / `#E5F4EA` | `#74DCA0` / `#0F2D22` | | |
| warning | `#935700` / `#FBF0DC` | `#E8B04E` / `#30250F` | | |
| danger | `#C0283A` / `#FCEAEC` | `#F27382` / `#3A1524` | | |
| info | `#1B32B4` / `#E9EEFF` | `#A0B8FF` / `#152357` | | |
| live | `#C0283A` / `#FCEAEC` | `#F27382` / `#3A1524` | `.live-dot` (pulses) | "Live" |
| verdict-accepted | `#13733A` / `#E5F4EA` | `#74DCA0` / `#0F2D22` | CircleCheck (+ ∎ in feeds) | Accepted |
| verdict-wrong | `#C0283A` / `#FCEAEC` | `#F27382` / `#3A1524` | CircleX | Wrong Answer |
| verdict-tle | `#935700` / `#FBF0DC` | `#E8B04E` / `#30250F` | Timer | Time Limit Exceeded |
| verdict-mle | `#9E2580` / `#F8E8F4` | `#E78DD2` / `#341A3A` | MemoryStick | Memory Limit Exceeded |
| verdict-runtime | `#B03F0D` / `#FCEDE4` | `#F49C6E` / `#3A1F1C` | Bug | Runtime Error |
| verdict-compile | `#981B4B` / `#F9E7EE` | `#F182A9` / `#3A1630` | Braces | Compile Error |
| verdict-internal | `#4C586E` / `#ECEFF5` | `#AAB5CD` / `#1B2645` | ServerCrash | Internal Error |
| verdict-queued | `#525E7B` / `#EBEFF8` | `#9CA9CC` / `#121D40` | Clock | Queued |
| verdict-running | `#1B32B4` / `#E9EEFF` | `#A0B8FF` / `#152357` | ∎ loader; static Clock under reduced motion | Running |
| difficulty-easy | `#08715F` / `#E1F3EF` | `#52CFB3` / `#0D2C31` | ■ square | Easy |
| difficulty-medium | `#935700` / `#FBF0DC` | `#E8B04E` / `#30250F` | ◆ diamond | Medium |
| difficulty-hard | `#BB2350` / `#FCE8EE` | `#F47D9E` / `#3A1630` | ▲ triangle | Hard |

The difficulty shape makes Easy/Medium/Hard distinguishable under deuteranopia even in dense tables (`.diff-mark::before` on the element with `data-difficulty`, or `<DifficultyGlyph>`). Medium and TLE share amber; they never appear in the same component and both carry text.

### 6.3 Contrast (computed, enforced)
`tests/unit/contrast.test.ts` reads `:root` and `.dark` from `globals.css`, resolves the aliases and checks, in both themes: the spec's 98 distinct pairs (text ≥ 4.5:1: ink/ink-2/muted/faint on bg, surface, sunken, raised; on-primary on primary states; links; on-cobalt, on-night; every semantic, verdict and difficulty colour on its tint, surface and bg or editor-bg; UI ≥ 3:1: input on surface/bg/sunken, ring on bg/surface, cobalt-line on cobalt, sky on night, primary on raised), the shadcn-only pairs (accent, muted, visited links, avatar, header, sidebar) and every Monaco token (≥ 4.5:1 on the editor background; cursor and bracket border ≥ 3:1). Key values: ink/bg 17.2 (L) and 17.6 (D); primary/surface 7.5 and 7.9; white on cobalt 8.8; input/surface 4.0. Decorative tokens (line, line-strong, night-line, highlight, cobalt as fill) are exempt: they never carry meaning alone. Add every new text pair to the test.

### 6.4 Elevation, radii, layout tokens
- Elevation: `--e1` (hairline, `shadow-sm`), `--e2` (lifted, `shadow-md`: 1px line + 0 12 24 −16 ink at 18%; dark: 1px ring + black), `--e3` (floating, `shadow-lg`). `shadow-e1/e2/e3` are aliases. `--primary-glow` is the coloured shadow under primary buttons.
- Radii: `rounded-sm` 6 (tags, kbd), `rounded-md` 10 (inputs, small buttons), `rounded-lg` 14 (panes, menus), `rounded-xl` 20 (cards, dialogs), `rounded-2xl` 28 (colour blocks), `rounded-full` (buttons, chips, segmented).
- Layout: `--container` 1312px, `--pad` 16px up to 390px wide → 48px from 1440px, `--gutter-w` 72px, `--section` clamp(72px … 128px) between landing sections.

### 6.5 Theme switch (dark only for now)
`src/lib/theme-config.ts` exports `THEME_TOGGLE_ENABLED` (currently `false`) and `FORCED_THEME = "dark"`. While disabled, the root layout renders `<html class="dark">` with `color-scheme: dark` on the server and passes `forcedTheme="dark"` to next-themes, so neither a stored "light" choice nor the OS preference can override it and there is no flash on first paint; `ThemeToggle` (header) and the theme segmented control (mobile sheet) are not rendered. **Re-enable the toggle: set `THEME_TOGGLE_ENABLED = true`** (one line); everything else (both token sets, next-themes `system`, Monaco light/dark, the circular theme-switch transition) is in place. Theme-aware client code reads `useAppliedTheme()` from `components/theme-provider.tsx` (next-themes' `resolvedTheme` ignores `forcedTheme`). The guide player follows the `.dark` class. E2E: `setTheme()` in `tests/e2e/guide/helpers.ts` skips a test that asks for the theme the site cannot show; `tests/e2e/site/design-v2.spec.ts` checks that the theme is forced and the toggle is absent. To review light locally, flip the flag in your working tree, rebuild, and do not commit the flip.

---

## 7. Type

### 7.1 Families (SIL OFL, `next/font/google`, self-hosted at build; no runtime request to Google)
| Role | Family | CSS | Notes |
|---|---|---|---|
| Display (≥ 28px only) | Instrument Serif 400 + italic | `--font-display` (`font-display`; `font-heading` / `font-serif` are aliases) | One weight: `font-synthesis-weight: none` on `html`, so `font-semibold` on a serif heading never fakes bold. The italic is for the one emphasised word of a headline. |
| UI and body | Instrument Sans (variable 400–700, `wdth` axis) | `--font-sans` | The wordmark uses `font-stretch: 92%`. |
| Code and labels | JetBrains Mono | `--font-mono` | Slashed zero; ligatures off in code (`font-variant-ligatures: none`). Monaco gets `fontMono.style.fontFamily` and remeasures after `document.fonts.ready`. |

### 7.2 Scale
| Class / token | Size | LH | Tracking | Use |
|---|---|---|---|---|
| `.display-hero` (`--t-hero`) | 56–112px | .92 | −1.2% | landing H1 only (`text-wrap: pretty`) |
| `.display-1` (`--t-d1`) | 44–84px | .96 | −1% | page H1 of index pages, landing section titles, 404 |
| `.display-2` (`--t-d2`) | 36–60px | 1.0 | −.5% | page H1 (`PageHead` default), lesson H1, section H2, auth titles |
| `.display-3` (`--t-d3`) | 30–42px | 1.05 | 0 | card titles on hero surfaces |
| serif fixed | 28–40px | | | problem title, verdict word (`VerdictLabel` 28px), dialog titles (30px), numerals |
| h3 | 22px sans 600 | 1.25 | −1% | card heading, step title |
| h4 | 18px sans 600 | 1.35 | | |
| `.lead` (`--t-lead`) | 18–21px | 1.55 | | lead paragraph, max 38ch |
| body | 16px (17.5 in lessons) | 1.6 | | problem statement 16/26, ≤ 72ch |
| sm / xs | 14 / 13px | 1.5 | | meta, tags |
| `label-mono`, `eyebrow` | 12px mono 500 uppercase | 1 | +6% | table heads, figure labels, quiet section labels |
| `.eyebrow-accent` | 12px mono, primary, 28px rule before | | | hero eyebrows ("Lemma 1 · Coding practice") |
| code | 14/22 (13.5 in cards, 12–13 mobile) | | | |

Rules: serif never below 28px, never in tables, buttons or form labels. One italic word per headline (`<em>`), in primary (inherits on colour blocks). Headlines balance. The serif `0` is narrow: small numbers (rings, badges, ranks) use sans 600 or mono. Mono labels are always uppercase and tracked.

## 8. Layout

- Container `container-page`: max 1312px, padding `--pad`.
- 12 columns, 20px gap, plus the 72px gutter column for `§` numbers. Sections are not centred; the only centred layout is the status page (404 / error).
- Rhythm: alternate quiet (paper) and loud (cobalt block, night block) sections; never two loud blocks in a row.
- Asymmetry: hero 1.22 : 1 (copy : stage), bento 7 : 5 then a full row, profile 1.15 : 1, room main : rail = 1fr : 340px, lesson 248px TOC · 720px article · 220px rail.
- Breakpoints: ≤ 960px mobile/tablet (gutters hide, burger sheet, tables become lists; use `max-[960px]:` / `min-[961px]:`), 961–1280 compact desktop (lesson rail hides), ≥ 1280 full.
- Density: catalog rows 56px, workspace header 52px with 8px pane gaps; landing and profile are generous.

## 9. Surfaces

| Level | Use | Spec |
|---|---|---|
| Paper | page | `bg-background`; behind heroes and page heads a `.grid-paper` (48px hairline grid in primary at 7–8%, masked) |
| Card | content | `bg-card`, 1px line, `rounded-xl`, `shadow-sm` (`<Card>`) |
| Lifted | hover, hero sheets, profile card | `shadow-md` (`<Card interactive>` lifts 3px) |
| Floating | toasts, menus, hero code sheet | `shadow-lg` |
| Cobalt block | one loud section per page | `.on-cobalt .grain`, `rounded-2xl`, grid paper at 16% sky (`<Card variant="cobalt">`) |
| Night block | footer, rooms hero, rooms card | `.on-night .grain`; in dark an inset 1px night-line edge (`<Card variant="night">`) |

Inside `.on-cobalt` / `.on-night` use `text-on-cobalt-2` / `text-on-night-2` for secondary text; the focus ring switches to white / sky there automatically.

## 10. Iconography and illustration

- lucide-react: 16px inline, 18–20px in tables and headers, 13px in pills, stroke 2 (1.75 at ≥ 20px). Custom SVG only for the logo and ∎.
- Illustration is code and diagrams, never pictures: real code in a sheet, monoline data-structure figures (8px-radius boxes, stroke 1.5, the "hot" node filled primary, mono 14px values), mono figure captions, hairline grids, test squares. No external images, emoji, 3D, gradients on controls or blobs.
- Example data is always labelled (`.example-tag`, "Example"); statistics are always real.
- Diagrams state their meaning in `role="img"` + `aria-label` or in the adjacent text.

## 11. Motion

Character: precise, then satisfying. CSS plus the Web Animations API only; no animation library (`tw-animate-css` stays for shadcn popups). Animate `transform`, `opacity`, `clip-path` (and colours on hover) only.

### 11.1 Tokens
| Token | Value | Use |
|---|---|---|
| `--d-1` | 120ms | colour and press feedback |
| `--d-2` | 200ms | hover lift, tabs, chips, arrows |
| `--d-3` | 320ms | popovers, toasts out, small springs, mount reveals |
| `--d-4` | 560ms | scroll reveals, sheets, toasts in |
| `--d-5` | 900ms | meters, count-ups |
| `ease-out` | `cubic-bezier(.16,1,.3,1)` | default |
| `ease-in-out` | `cubic-bezier(.65,0,.35,1)` | loops (loader, figures) |
| `ease-snap` | `cubic-bezier(.34,1.56,.64,1)` | ∎ snap, test squares |
| `--rise` | 16px (0 under reduced motion) | reveal distance |
| stagger | 70ms per index, clamped at 8 | lists (`revealStyle(i)`) |

`MOTION` in `src/lib/motion.ts` mirrors these for JS; v1 names (`--duration-*`, `--motion-*`) remain as aliases.

### 11.2 What moves
- **Landing hero:** problem card and code sheet rise in (100 / 280ms), code lines type in (`clip-path` steps, 160ms per line), the Accepted bar slides in at 1.7s, 12 test squares pop at 70ms each from 1.8s, the margin note at 2.4s, the headline ∎ snaps at 1.6s. Runs once, under 3s, no hover tracking. The H1 renders at once (LCP).
- **Scroll reveals:** `<Reveal trigger="scroll">` (class `.rv`) fades and rises 16px when 10% is in view. `<RevealObserver>` (root layout) shows them and also watches content added later. The server markup is visible: `.rv` hides only under `html.js` (set by an inline script before paint), never under reduced motion.
- **Mount reveals:** `<Reveal>` (class `.reveal`) fades and rises 8px on render, CSS only.
- **Count-ups:** `<CountUp value={n} />` renders the final value on the server and counts from 0 over 900ms (easeOutCubic) when it first scrolls into view; `tabular-nums` on the parent.
- **Meters:** `<Progress>` fills by transform with a stagger (`delayMs`).
- **Hover and press:** buttons darken (120ms), a trailing icon with `data-arrow` nudges 3px, press scales to 0.97; interactive cards lift 3px; table rows tint; theorem rows slide their arrow 4px and colour the number; chips flip to ink when pressed.
- **Page enter:** cross-document `@view-transition { navigation: auto }` (full loads) with a short root crossfade; the header has `view-transition-name: site-header`. Progressive enhancement only. Client-side route changes do not animate yet: wrapping the `(site)` children in React's `<ViewTransition>` was tried and made e2e flaky (old and new page content briefly both in the DOM, duplicate test ids); revisit with a scoped `<ViewTransition>` per page and e2e that wait for `document.activeViewTransition` to end. Each page still enters with its mount reveals.
- **Theme switch** (when the toggle is enabled): a View Transitions circle from the toggle (520ms); instant without support.
- **Loaders and skeletons:** `<QedLoader />` (14px square outline filling bottom-up, 1.2s loop) replaces spinners, also inside `<Button loading>` (label kept, no width jump) and the Running verdict. Skeletons are sunken blocks with a transform shimmer, hidden under reduced motion.
- **Phase 2 targets:** workspace (Run/Submit show the loader, the verdict word fades in, test squares fill per case, one ∎ snap on Accepted, no confetti), rooms (live dot pulses 1.8s, a new scoreboard event flashes the row 1.6s, toasts slide up, max 3, pause on hover/focus; the timer colon blinks only in the last 5 minutes), guide (frame transitions 320ms keyed by element ids, push uses `ease-snap`, autoplay every 1.2s, keyboard-operable controls).

### 11.3 Reduced motion (strict)
Under `prefers-reduced-motion: reduce`: `--rise` and `--motion-distance` are 0; every animation and transition runs in 0.01ms with no delay, so it ends in its final state (fully typed code, all squares, ∎); reveals show at once; count-ups keep the final value; the loader is a static outline; the live dot is static; view transitions are off. The guide player keeps its own motion setting (`data-motion`), and its computed transition durations stay ≤ 1ms under reduce unless the user turned animations on.

### 11.4 Budget
Motion JS stays tiny (reveal observer, count-up, header scroll state). At most ~12 concurrently animating elements per viewport, no layout thrash, long tasks under 50ms, nothing delays LCP. `backdrop-filter` only on the header (solid fallback under `@supports not`). Grain is a static SVG data URI.

## 12. Components

| Component | File | v2 spec |
|---|---|---|
| Button | `ui/button.tsx` | Pill. Sizes `sm` 34 / `default` 44 / `lg` 52, `icon` 40, `icon-sm` 32 (+ hit area). Variants `default` (primary, inset top highlight + coloured shadow), `secondary` (`outline` alias: surface + line-strong, hover border ink-2), `soft` (primary-soft), `ghost`, `invert` (on cobalt/night: white pill, cobalt text), `night` (transparent + night-line), `destructive`, `link`; `header` / `header-solid` are kept as aliases (ghost / primary). `loading` = ∎ loader, label kept, disabled, `aria-busy`. Trailing `data-arrow` icon nudges on hover. |
| Input / Textarea / Select | `ui/input.tsx` (`fieldClasses`), `ui/textarea.tsx`, `ui/select.tsx` | 44px (`sm` 34), radius 10, 1px `--input`. Focus = ring-colour border (carries 3:1) + 3px 22% halo. `aria-invalid` = danger border + halo. Placeholder faint. |
| Label / Field | `ui/label.tsx`, `ui/field.tsx` | Label 14px 600; `FieldHelp` muted; `FieldError` danger + CircleAlert + text, linked with `aria-describedby`. |
| Card | `ui/card.tsx` | radius 20, `shadow-sm`; `interactive` lifts 3px with e2; `variant="cobalt" | "night"` colour blocks (radius 28, grain); `size="sm"`. |
| Badge | `ui/badge.tsx` | 24px pill, 12.5px 600, icon 13px; `default`, `secondary`, `outline`, `tag` (6px radius, sunken, line border), `status` (colours from a dictionary). |
| Chip | `ui/chip.tsx` | filter chip: 34px pill, line-strong border, pressed (`aria-pressed` / `pressed`) = ink fill; `ChipCount` faint mono; `chipClasses()` for links. |
| Segmented | `ui/segmented.tsx` | sunken track, pill thumb with e2; `role="group"` + label, `aria-pressed`, arrow keys. |
| Tabs | `ui/tabs.tsx` | 2px primary indicator inset 10px, slides by transform; arrow keys (Base UI). Console tabs are 42px in phase 2. |
| Table | `ui/table.tsx` | Mono uppercase head (12px, +6%), 56px rows (`compact` 44), hairline separators, hover = sunken tint, `numeric` cells right-aligned tabular; `tableLinkClasses()` (only the title is a link). Mobile: render as a stacked list. |
| Dropdown menu | `ui/dropdown-menu.tsx` | raised, radius 14, e3, 36px items, highlight = accent, mono group labels. |
| Tooltip | `ui/tooltip.tsx` | inverted, radius 8, 13px; `Kbd`. |
| Dialog / AlertDialog | `ui/dialog.tsx`, `ui/alert-dialog.tsx` | radius 20, e3, title in the display serif at 30px, 320ms in. |
| Sheet | `ui/sheet.tsx` | paper background, 560ms slide; mobile nav uses it full height (§13.12). |
| Toast | `ui/sonner.tsx` | raised, radius 14, e3, title 14.5/600 + muted subline, ∎ loader for loading; bottom-right (top-centre on mobile, where the workspace action bar is). Never steals focus. |
| Progress | `ui/progress.tsx` | 6px bordered sunken track, fill by transform with a delay; `role="progressbar"` + label. |
| Skeleton | `ui/skeleton.tsx` | sunken block, radius matched to the target, transform shimmer. |
| Avatar | `ui/avatar.tsx` | 10px-radius squircle (not a circle), primary-soft initials, decorative. |
| Breadcrumb | `ui/breadcrumb.tsx` | 14px muted, "/" separators. |
| Pagination | `components/pagination.tsx` | 38px squares radius 10, mono numbers, current = ink fill; links (`?page=`). |
| Alert | `ui/alert.tsx` | tinted semantic background, the icon carries the colour, text stays ink; radius 14. |
| Switch / Checkbox / Radio | `ui/switch.tsx` … | unchanged structure, v2 tokens. |
| VerdictBadge / VerdictLabel / VerdictIcon | `judge/verdict-badge.tsx` | badge = colour + icon + word; `VerdictLabel` = serif 28px word + icon (console, submission head; phase 2 may go to 34px); Running = ∎ loader, static Clock under reduced motion. Dictionaries in `judge/verdict.ts`. |
| TestSquares | `judge/test-squares.tsx` | `results: ("pass" | "fail" | "pending")[]`, `animate`, `delayMs`; `squaresFromCounts(passed, total)`. Always `aria-hidden` with a text summary next to it. |
| DifficultyBadge / DifficultyGlyph | `problems/difficulty-badge.tsx` | `variant="text"` (tables: coloured word + shape) or `"pill"` (cards: tinted pill + shape). |
| ProblemStatusIcon | `problems/problem-status-icon.tsx` | icon + sr-only word (Solved / Attempted / Not started). |
| Qed / QedLoader | `brand/qed.tsx`, `brand/qed-loader.tsx` | `<Qed />` inline 0.4em, `size={n}` px, `snap` + `delayMs`, `open` (dashed); `<QedLoader />` in `currentColor`. |
| SectionHead / SectionNumber / ProofGutter | `layout/section-head.tsx` | `§ NN` in the 72px gutter + title + description + action (action hidden below 961px); gutter numbers with `current`. |
| PageHead | `page-head.tsx` | breadcrumb, h1 `display-2` (`size="d1"` for index pages), optional `qed`, subtitle, `leading` (avatar), `actions` (aside slot); paper with a masked grid. |
| EmptyState | `empty-state.tsx` | "unfinished proof": dashed card with a dashed ∎ box, serif 28px title, body, one action; `given` / `want` add the mono "Given / Want / Proof ▍" lines; `icon` optional. |
| StatusPage | `status-page.tsx` | centred dashed ∎ (danger-tinted for errors), eyebrow, d1 title, lead, actions, mono footnote (error digest). Used by 404 (`not-found-content.tsx`, shows the missing path) and both `error.tsx` boundaries. |
| PageSkeleton | `page-skeleton.tsx` | copies the page head + table/profile shapes, ∎ loader + "Loading…". |
| Reveal / RevealObserver / CountUp | `motion/*` | §11.2. |

## 13. Pages

Legend: `[G]` = 72px gutter column; ▮ = cobalt block; ▓ = night block. Every page has a `<title>` like "Problems · LemmaYard" and one `h1`.

### 13.1 Landing `/` (phase 1, done)
```
Header (sticky, translucent)
HERO  [G 01..10] | eyebrow "Lemma 1 · Coding practice"           | proof stage: problem card
                 | H1 hero "Every solution is a small proof∎"     |   └ code sheet (types in)
                 | lead, 38ch                                      |     └ Accepted bar + 12 squares
                 | [Start practicing →] [Browse problems]          |  margin note "hash map: O(1)"
                 | facts row (icons)                               |  (grid paper, radial mask)
LEDGER (surface band): § 01 | N problems | min–max tests | N lessons | 2 languages
▮ § 02 HOW IT WORKS: d1 "From statement to Accepted in four steps." + lead + pipeline → 4 numbered steps
§ 03 "Three ways to practice." [See all] — bento: Catalog card (7) | Guide card soft-blue + heap figure (5)
                                            ▓ Rooms card (12): copy + example scoreboard
§ 04 "Start with these." — theorem rows: serif number · title · tags · difficulty · →
§ 05 profile: copy + CTA | profile card (count-ups, meters)
§ 06 closing: d1 "Your first proof is one problem away∎" + CTAs | unfinished-proof card
▓ Footer with giant wordmark
```
Data rules (`src/server/landing.ts`): the ledger shows only real numbers (published problems, min–max test cases per published problem, published guide lessons, supported languages) and drops a cell it cannot compute; with the database down the page renders without numbers. The featured list is the curated `FEATURED_SLUGS` starter set (unpublished or missing slugs are skipped) and also feeds the catalog card, whose statuses are labelled "Example". The profile card shows the signed-in user's real numbers (the profile's helper) or an "Example" card for guests, with real catalog totals. The hero CTA goes to `/problems` ("Continue practicing") for users and `/register` for guests; the rooms CTA goes to `/rooms` or `/register?next=/rooms`. Mobile: gutters hide, the hero stacks (H1 56px), the stage sits under the CTAs, the ledger is 2×2, bento cards stack, theorem rows become number + title/difficulty + arrow.

### 13.2 Login / Register (phase 1, done)
From 961px a split inside the container: left 5/12 the form on paper (`display-2` "Welcome back∎" / "Start your first proof∎", description, 44px fields, full-width primary button, link to the other form); right 7/12 a cobalt block with grain and grid paper: login shows "Lemma of the day" (one published problem per UTC day: number, title, difficulty, tags, a Given/Want/Proof sheet and "Read the problem"), register shows "What you get" as a ∎ list. Mobile: a 120px cobalt strip with the mark above the form; the form stays first in DOM and tab order. Field errors are inline (danger + icon + text); 409 errors attach to their field; pending = ∎ loader in the button.

### 13.3 Problems catalog `/problems` (phase 2)
- Page head: breadcrumb, d1 "Problems∎", meta line, and on the right a progress card (ring + Easy/Medium/Hard counts); guests see "Sign in to track progress".
- Sticky tool row under the header: search with a "/" kbd, a difficulty segmented control, a status segmented control (signed in only), then a topic chip row with counts (horizontal scroll on mobile).
- Table: status icon (sr-text), #, title, topics, acceptance (mono, "—" with 0 submits), difficulty (word + shape). Mobile: list rows (icon · "1. Two Sum" · difficulty / topics · acceptance).
- Footer: pagination + "Showing x–y of N". Empty filter result: unfinished proof ("Given: Hard · Graph", "Want: a problem", action "Clear filters").
- Kept behaviour: filters write to the URL (`q`, `difficulty`, `tag`, `status`, reset `page`), search submits on Enter and a 300ms debounce, the status filter and column are hidden for guests, query budget AC-M3-7. z-index stack: header 40 > tool row 5 > table head; anchors `scroll-margin-top: 140px`.

### 13.4 Problem workspace `/problems/[slug]` (phase 2)
```
52px bar: mark | Problems / 1. Two Sum ‹ › |   [▶ Run ⌘'] [⇧ Submit]   | avatar
8px canvas (sunken), 3 panes radius 14, 8px resizers (grip turns primary on hover/focus):
 LEFT 44%: tabs Description · Submissions · Guide link; serif 40px "1. Two Sum", pills;
   prose 16/26 ≤ 72ch; "EXAMPLE 1" mono rule-heads; IO blocks = sunken + 2px primary rule
 RIGHT TOP 58%: toolbar (language, "Saved", reset) | Monaco | status bar (Ln/Col)
 RIGHT BOTTOM 42%: tabs Testcase · Result
   verdict row: icon + serif 34px word + mono "7 / 15 passed · first failure on test 8" + squares
   case tabs → Input / Expected | Your output (danger) / Stdout
```
Accepted: green word, ∎ snap, runtime and memory chips. Running: ∎ loader + "Running test 6 of 15" with live squares. Custom-input Run shows "Output" without a verdict word. Mobile: Problem / Code / Console tabs under the bar and a fixed bottom action bar (Run, Submit).

Kept behaviour (v1 §8.21–8.22, §9.4): `react-resizable-panels` with `autoSaveId`, keyboard resizers (arrows move 5%), panes scroll internally; console result region `aria-live="polite"` announcing only the final verdict; queued/running timeouts show warning alerts; submit metrics as stat tiles; run cases as pills with per-case icons, a wrong output tinted danger; Runtime/Compile Error text in a mono danger block (≤ 8 KB, scrolls); TLE/MLE as one sentence; Internal Error explains it does not count; truncated values end with "… (truncated)"; guests clicking Run/Submit go to `/login?next=…`; Run/Submit disabled while a job is active, with tooltips carrying the shortcuts; the room-session banner (§13.10) sits between the header and the panes.

### 13.5 Monaco themes (`src/lib/monaco-themes.ts`, phase 1 done)
| Token | Light (bg `#FBFCFF`) | Dark (bg `#09112A`) |
|---|---|---|
| default / identifier | `#0A1433` | `#EBF0FF` |
| keyword, tag | `#2340D8` | `#A9BEFF` |
| string | `#13733A` | `#74DCA0` |
| number, constant, string.escape | `#935700` | `#E8B04E` |
| comment (italic) | `#5F6B88` | `#8C9ABF` |
| type, type.identifier, attribute.name | `#7B2AA8` | `#E2A8FF` |
| function, predefined | `#16288F` | `#D4DEFF` |
| delimiter, operator | `#525E7B` | `#9CA9CC` |
| regexp | `#B03F0D` | `#F49C6E` |
| line number / active | `#5F6B88` / `#0A1433` | `#7F8DB3` / `#EBF0FF` |
| selection, line highlight | `#DCE5FF`, `#2340D80F` | `#1D2C66`, `#8DA8FF14` |
| cursor, bracket border, indent guide | `#2340D8`, `#2340D8`, `#D8DFEE` | `#A9BEFF`, `#8DA8FF`, `#1F2C55` |

Names stay `lemmayard-light` / `lemmayard-dark` (registered by name in `components/problem/monaco/setup`); pick with `monacoThemeFor(useAppliedTheme())`. Options (`MONACO_EDITOR_OPTIONS`): JetBrains Mono 14/22 via `fontMono.style.fontFamily`, **ligatures off**, minimap off, `renderLineHighlight: "all"`, padding top 12, no bracket-pair colours; `remeasureFonts()` after `document.fonts.ready`. Monarch emits no function-call token, so function colours appear only in static samples (`.tok-*` classes).

### 13.6 Submissions `/submissions` and `/submissions/[id]` (phase 2)
- List: d2 head "Submissions" + filters (verdict, language, problem). Columns: time (mono, relative + absolute in a tooltip), problem, verdict badge, language, runtime, memory, test squares (≥ 1280). Mobile list rows. Empty: unfinished proof + "Browse problems".
- Detail: two-column head (serif verdict word with icon, problem link, meta chips | the full test-square strip with the failing index labelled); body: the failing case (Input / Expected / Your output / Stdout) for Wrong Answer, the error text in a mono danger block for Runtime/Compile Error, then a read-only code viewer (editor-bg + gutter) with "Open in editor" and "Copy". The verdict card keeps its 4px left edge in the verdict colour.

### 13.7 Profile `/u/[username]` (phase 2)
Head: 120px cobalt monogram with a ∎ corner, eyebrow "Profile · public", d1 username, meta, "Your submissions" (own profile only). Stats band: three 96px serif numbers with count-ups (Solved x / N, Submissions, Acceptance %). Body: the proof sheet (one square per published problem by difficulty: filled = solved, dashed = attempted; legend and meters) and "Recently solved" (last 10 unique, green ∎, title, difficulty, language, first-Accepted date). Public: never shows code (AC-M6-4).

### 13.8 Guide index `/learn` (phase 2B, done)
Hero: eyebrow "Guide", d1 "Data structures, *step by step*∎", lead, "Continue: …" when there is local progress. Track map as a vertical proof (gutter numbers), one row per lesson: status square (done ∎ / in progress half / todo outline), title, minutes, prerequisite chip, a monoline glyph. Bonus and review tracks are night-tinted cards. Glossary link.
Built: `(site)/learn/page.tsx`, `guide/content/RoadmapCard.tsx` (one row per lesson; the line number is the lesson's place among the published lessons, also used by the lesson eyebrow and the lesson bar), `LessonGlyph.tsx`, `RoadmapProgress.tsx` (`LessonStatusBadge`: square + word, `pill` / `row`), styles in `guide/guide.css`.

### 13.9 Lesson `/learn/[slug]` (phase 2B, done)
Three columns: TOC by track with status squares and "x of N · stored in this browser" | article 720px | rail ("On this page", margin notes). Article: eyebrow, d2 H1 with an italic phrase, lead, meta, prose 17.5/1.7, h2 with mono `NN` numbers (serif h2 ≥ 28px), dotted glossary terms. Viz player: card radius 28; top bar (operation, language, phase pill); stage (editor-bg, 24px grid, counters) and side (narration "Step 3 of 4" + code with the active line); controls back / play / forward and a scrubber of step segments. A11y: `role="group"` + label, stage `role="img"` with a frame-specific label, narration `aria-live="polite"`, slider with arrow keys. Then Predict (dashed primary border), cost tables with qualifier tags, "Check yourself" (correct = success + ∎). Mobile: sticky "Lesson 5/15" bar with squares and an "All lessons" sheet; the player stacks. The player's `--viz-*` tokens (`components/guide/viz-theme.css`) map to the shadcn names above, so the guide re-skins with the tokens.
Built: `LessonShell.tsx` + `LessonTrackNav.tsx` (lessons by track from 961px; below, the sticky bar and the "All lessons" disclosure, Esc closes), `LessonToc.tsx` (active section), player skin in `guide/player/*` and `guide.css` (top bar, 24px-grid stage, mono step caption, segment scrubber over the native range, key-step squares, dashed Predict). Decisions: the player's two-column layout (figure | code) is a container query on the player (`@min-[52rem]/player`), so inside the article column it stacks (figure, narration, controls, code); counters stay under the controls (not over the stage, where they would cover nodes); margin notes are not built (no lesson content uses them). `guide.css` is unlayered on purpose: it overrides `ui/table` utilities in the cost tables.

### 13.10 Rooms (phase 2B, done)
- List `/rooms`: d1 "Rooms∎" + "Create room" + "Join with code"; cards (radius 20) with the room name in serif d3, members, next session (mono), a Live pill (card on a night block) and last week's winner. Empty: unfinished proof ("Given: friends", "Want: a weekly session", action "Create a room").
- Live session: night hero (breadcrumb, Live pill, d1 room name + sky ∎, members, meta; a giant mono timer, `role="timer"`, announced every 5 minutes, never every second; time-remaining track; invite / leave). Body: problem cards A/B/C (letter tile, difficulty pill, title, your status), the scoreboard (rank numbers, avatar + online dot, "you", per-problem cells ✓ time / ✗ tries / —, solved count; a new Accepted row flashes; mobile: squares under the name), the right rail (activity feed `aria-live="polite"`, verdict events only; rules card "only verdicts are shared"). Toasts bottom-right, max 3, never steal focus.
- History: a week list and the selected week (final scoreboard, problems, "Proof of the week" = first Accepted per problem), a monoline sparkline per member with an sr-only table equivalent.
- Kept behaviour (v1 §9.9): components in `components/rooms/live/` and `lobby/`, pure view models in `src/lib/rooms/`; status badges are icon + word (Lobby Clock, Live Radio, Finished Flag, Cancelled Ban); countdown `tabular-nums`, warning colour under 10 minutes, milestones (10 min, 1 min) in one polite region; below lg a sticky bar with the inline countdown and "You 1/4 · Leader 2/4"; lobby slots with re-roll/pin icon buttons + tooltips, draw errors as warning alerts, a calibration card; live layout `grid-cols-[1fr_20rem]` ≥ lg and Tabs below; scoreboard as a table ≥ md (sr-only caption, row headers, viewer row tinted) and cards below, "First" / "Solved before" as words, an sr-only sentence per cell, no verdict names or code; "Reconnecting…", lost access (danger alert), pending judging (muted line / info alert), cancelled (empty state); the problem-page banner (40px info strip with room, "Problem 2 of 4", countdown, progress, prev/next, Session link, notification settings).
- Built (phase 2B): night hero only while live (lobby, finished and cancelled keep a paper head with "Session · date"); the hero timer is `Countdown size="hero"` with `totalMs` for the track; styles in `components/rooms/rooms.css` (imported by `countdown.tsx`; the night-safe amber `#E8B04E` is the one literal, as night is dark in both themes). Decisions: problem tiles show the number (the copy says "Problem 1"), not a letter; ranks are sans 600 with the leader in primary (§7: small numbers and tables never use the serif); attempted cells are ✗ + tries in danger; no online dot and no "last week's winner" / "next session" on room cards (the data does not exist yet); no "Join with code" (invites are links); the scoreboard row flash is a 1.6s success tint on a newly rendered solved cell.

### 13.11 404 / error / empty / loading (phase 1, done)
- 404 (`(site)/not-found.tsx`, `(workspace)/not-found.tsx`, root `not-found.tsx`, lesson 404): `StatusPage` with a dashed ∎ box, eyebrow "404 · Not found", d1 "This page is not proven yet.", "We couldn't find `/path`." and [Go to problems] [Home].
- Error (`(site)/error.tsx`, `(workspace)/error.tsx`): the same layout with a danger-tinted ∎, "Something broke on our side.", [Try again] [Home] and the error digest in mono faint. No stack traces.
- Offline / judge unavailable: an info alert with Clock + text and a retry; Submit disabled with the reason in its tooltip.
- Loading: route skeletons that copy the target layout (`PageSkeleton`); inline loaders use `<QedLoader />`. Don't add a route-level `loading.tsx` to a page that calls `requireUser()` or `notFound()`: once the loading shell streams, the redirect or 404 can no longer set the HTTP status; use `<Suspense fallback={<PageSkeleton />}>` after the checks instead. On a route with `loading.tsx` (the catalog) a failing query streams the error boundary under an HTTP 200 that is already sent, so uptime checks probe `/api/health`.

### 13.12 Header, footer, navigation (phase 1, done)
- Header (`site-header.tsx`): sticky translucent paper (`.site-header`: `backdrop-filter` with a solid fallback), the hairline border appears after an 8px scroll (`HeaderScrollState`), 68px (60px below 961px, 52px `compact` in the workspace). Skip link first. Nav pills Problems, Guide, Rooms (signed in); the active item gets a 5px ∎ dot under it. Right: the theme toggle (only when enabled), the account menu (avatar + username; its accessible name comes from the visible content: username + sr-only ", account menu") or Log in / Sign up. Below 961px: Sign up (guests) + the burger. A notifications bell (room events, unread primary dot) is planned for rooms; not built yet.
- Account menu: Profile, Submissions, Log out (∎ loader while logging out).
- Mobile sheet (`mobile-menu.tsx`): from the right, full height, paper; nav links in serif 36px with `§ NN` numbers (active = primary italic), then the theme segmented control (only when enabled) and the account items or Sign up / Log in. Focus is trapped, Esc closes, it closes itself when the viewport reaches 961px.
- Footer (`site-footer.tsx`): night block with grain, four columns (brand + blurb, Practice, Learn, Account), the giant serif wordmark with a sky ∎ (clamp 60–236px, `aria-hidden`), base row. Absent from the workspace group.

## 14. Tailwind v4 / shadcn notes

- Tokens live in `:root` / `.dark` **and** are mapped in `@theme inline` (`--color-*`) to get utilities. Only theme-independent values (easing, the brand scale) go in `@theme`. `@custom-variant dark (&:is(.dark *))` follows the next-themes class.
- Opacity modifiers (`bg-primary/20`) work through `color-mix`; prefer explicit `*-bg` tokens under text.
- Focus: the global `:focus-visible` outline (2px `--ring`, offset 2px); inputs use border + halo. Don't put `outline-none` on an element that relies on `focus-visible:outline-2`.
- `buttonVariants()` and `chipClasses()` return merged class strings (via `cn`, which merges Tailwind conflicts), safe on links.
- Never build class names dynamically (`text-verdict-${x}`); dictionaries export literal class strings.
- Folder convention: `src/components/ui/` = primitives only; `src/components/<domain>/` = app components; cross-domain pieces at `src/components/` root; signature marks in `brand/` and `layout/`.
- After large `globals.css` edits, if a production build still serves the old CSS, delete `.next` (seen once with the Turbopack cache).

### 14.1 Using the v2 pieces in phase 2 (quick guide)
```tsx
<PageHead size="d1" qed crumbs={[{ label: "Home", href: "/" }, { label: "Problems" }]} title="Problems"
  subtitle="20 problems · Python 3 and JavaScript" actions={<ProgressCard />} />
<SectionHead n={3} title={<h2 className="display-1">Three ways to <em>practice</em>.</h2>}
  action={<Link className={buttonVariants({ variant: "secondary" })} href="/problems">See all <ArrowRightIcon data-arrow /></Link>} />
<Reveal trigger="scroll" index={i}>…</Reveal>          // list items, cards
<CountUp value={stats.solved} />                       // inside a tabular-nums parent
<TestSquares results={squaresFromCounts(7, 15)} />     // + visible "7 / 15 passed"
<VerdictLabel status="accepted" /> <Qed size={10} snap />
<EmptyState title="No problems match" given="Hard · Graph" want="a problem" action={<Button>Clear filters</Button>} />
<Card variant="night">…</Card>  <section className="on-cobalt grain rounded-2xl">…</section>
<Chip pressed={active}>Array <ChipCount>9</ChipCount></Chip>
<Segmented label="Difficulty" options={…} value={v} onValueChange={setV} />
```
Type classes: `display-hero`, `display-1/2/3`, `lead`, `label-mono`, `eyebrow`, `eyebrow-accent`, `example-tag`, `kbd`, `hl`. Signature utilities: `qed`, `qed-open`, `qed-loader`, `proof-gutter`, `sec-no`, `test-squares`, `diff-mark`, `diff-glyph`, `live-dot`, `grid-paper`, `grain`, `on-cobalt`, `on-night`. Code sample colours: `tok-k`, `tok-f`, `tok-s`, `tok-n`, `tok-c`, `tok-p`.

## 15. Accessibility checklist

- [ ] Every text pair holds (§6.3); new pairs go into `tests/unit/contrast.test.ts` before merging.
- [ ] Focus: a visible 2px ring with 2px offset on every interactive element, including Monaco (`focusBorder`), resizers, case pills, chips and the segmented control. Never `outline: none` without a replacement.
- [ ] Hit targets ≥ 40×40px (nav, pagination, icon buttons, selects); 32px toolbar buttons get the `after:-inset-1` extension; mobile tabs 44px.
- [ ] Colour is never the only signal: verdicts, difficulty (word + shape) and status always carry a word (visible or sr-only) and an icon or shape.
- [ ] Decorative marks (∎, squares, gutters, grain, example figures) are `aria-hidden`; illustrative content is labelled "Example" and described once (`role="img"` + `aria-label`).
- [ ] Console result region `aria-live="polite"`, final state only. Room timer announces at milestones only. Toasts never steal focus.
- [ ] Run and Submit are reachable by Tab from the editor (Monaco traps Tab; document Ctrl/Cmd+M).
- [ ] Progress bars expose `role="progressbar"` with values and labels.
- [ ] `prefers-reduced-motion` honoured (§11.3): final states at once, no movement; the guide player's own motion switch still works.
- [ ] One `h1` per page; the problem title is the `h1` on the problem page.
- [ ] Forms: `label for`, `aria-describedby` for help/errors, `aria-invalid`, autocomplete.
- [ ] `<html lang="en">`; `color-scheme` set for native controls and scrollbars in both themes.
- [ ] axe (WCAG 2.1 A/AA, serious + critical = 0) in every theme the site allows (`tests/e2e/site/design-v2.spec.ts`, guide and rooms specs).

## 16. Do / don't

Do:
- Use tokens, never raw hex in components (the `tok-*` code colours and the Monaco data are the exceptions).
- Render every verdict, difficulty and status through its one component.
- Keep one ∎ headline per viewport, one loud block per page, one italic word per headline.
- Label example data; show only real statistics.
- Right-align numbers with `tabular-nums`; "—" for missing values. Sentence-case UI copy; verdict names keep Title Case.

Don't:
- No serif below 28px, in tables, forms, buttons or badges.
- No gradient meshes, glass, neon glow, blobs, emoji or icon-circle feature grids; `backdrop-filter` only on the header.
- Don't use `--sky` or the cobalt 300–500 steps for text on paper.
- Don't add a hue without adding its pairs to the contrast test.
- Don't make whole table rows clickable or hide information in hover-only states.
- Don't animate layout properties or delay the LCP element.

## 17. Limits (honest notes)

- Contrast is checked for solid colours; tints made with opacity modifiers are not in the table.
- Monaco's monarch tokens have no function-call token, so function colours show only in static samples.
- `next/font` adds `size-adjust` fallbacks; metrics differ slightly from the HTML previews.
- The Instrument Sans variable font (with `wdth`) is the heaviest font file; the only width use is the wordmark. Drop the axis if it ever matters.
- Cobalt on the night page is loud; if feedback says so, try `--cobalt: #1A2FA8` in dark.
- Page enter transitions cover full page loads only (cross-document View Transitions, Chromium); client navigations are instant (§11.2).
