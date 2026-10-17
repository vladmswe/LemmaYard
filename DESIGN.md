# LemmaYard design system: "Collegiate modern"

The UI source of truth. Owner brief: university / Coursera feel, calm and trustworthy, blue core palette, light theme primary, blue-based dark theme, English UI. Every page and component follows this file; if code and this file disagree, fix one of them in the same change.

Implementation map:

| What | Where |
|---|---|
| Tokens (light/dark), `@theme inline` mapping, prose, motion keyframes | `src/app/globals.css` |
| Fonts (next/font, self-hosted) | `src/app/fonts.ts` |
| shadcn primitives (Base UI), themed | `src/components/ui/*` |
| Verdict / difficulty / problem-status dictionaries | `src/components/judge/verdict.ts`, `src/components/problems/difficulty.ts`, `src/components/problems/problem-status.ts` |
| Status components | `judge/verdict-badge.tsx` (`VerdictBadge`, `VerdictLabel`, `VerdictIcon`), `problems/difficulty-badge.tsx`, `problems/problem-status-icon.tsx` |
| Shared app pieces | `site-header.tsx`, `header-nav.tsx`, `mobile-menu.tsx`, `user-menu.tsx`, `theme-toggle.tsx`, `site-footer.tsx`, `page-head.tsx`, `empty-state.tsx`, `pagination.tsx`, `page-skeleton.tsx`, `not-found-content.tsx`, `brand/logo.tsx`, `motion/reveal.tsx` |
| Monaco themes (plain data, register in M3/M5) | `src/lib/monaco-themes.ts` |
| Contrast check over the real token values | `tests/unit/contrast.test.ts` (fails on any regression) |
| Route groups | `src/app/(site)/` = header + footer, `src/app/(workspace)/` = compact header, full height, no footer (problem page) |

## 2. Decision

**Chosen: D, "Collegiate modern".** A carries the strongest university signal, but a serif UI fails at data-dense tables, and its cream paper fights a code editor. B is the cheapest and the most legible, but it looks like any SaaS dashboard. D keeps B's structure (white cards, light blue-tinted surfaces, one strong action blue, a humanist sans that holds up at 13–15px in tables). It adds A's academic cues where they cost nothing in density: a navy masthead like a university site, serif display headings, numbered "syllabus" lists and a thin old-gold rule. The cues stay out of tables, the editor and the console. Every text pair passes AA in both themes, and the dark theme is a navy family, not black or neon.

## 3. Principles

1. **One blue means "act".** `--primary` (`#2457C5` light / `#5B8DEF` dark) is used only for primary buttons, links, focus, the selected tab or page and progress toward a goal. Decoration uses tints (`blue-50…200`), never the solid primary.
2. **Serif for titles, sans for work.** Source Serif 4 is used only for display, h1, h2, problem titles and the verdict name. Everything you scan, type into or compare (tables, forms, badges, the console) uses Source Sans 3 or JetBrains Mono.
3. **Status = color + icon + word.** No verdict, difficulty or problem status is ever shown by color alone.
4. **Calm surfaces, crisp edges.** White cards on a faintly blue page, 1px borders, small radii (4–8px), soft shadows. No gradients on controls, no glassmorphism, no blobs.
5. **Reading first.** Problem statements are set at 16/26 with a 72ch measure, and examples and constraints are visually distinct. Long content always scrolls inside its own pane, never the whole page, on the problem page.

---

## 4. Color

### 4.1 Brand scale "Lapis" (both themes)

| Step | Hex | on white | Typical use |
|---|---|---|---|
| 50 | `#F3F7FD` | 1.08 | info background, hovered nav tint |
| 100 | `#E4EDFB` | 1.18 | `--secondary` (soft button, selected chip) |
| 200 | `#C8DAF6` | 1.42 | note border, avatar background |
| 300 | `#9DBCEE` | 1.93 | example block left rule, selected case border |
| 400 | `#6C98E3` | 2.90 | decorative only |
| 500 | `#3F73D6` | 4.53 | large text or icons only |
| 600 | `#2457C5` | 6.47 | **primary** (light) |
| 700 | `#1C46A3` | 8.56 | primary hover, info text |
| 800 | `#1A3B82` | 10.54 | primary active, secondary-foreground |
| 900 | `#192F63` | 12.90 | avatar text |
| 950 | `#0E1A38` | 17.16 | **masthead** (light) |

Old-gold accent: `#C8922A` light / `#D9A94A` dark. **Decorative only**: the masthead rule (first 64px), the active nav underline and the hero rule. Never used for text, and never next to a Medium badge.

### 4.2 Theme tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `#FFFFFF` | `#0D1628` | page |
| `--surface-sunken` | `#F5F8FC` | `#0A1222` | hero/band sections, table header, IO blocks, problem-page canvas |
| `--card` | `#FFFFFF` | `#131F36` | cards, panes, table body |
| `--popover` | `#FFFFFF` | `#17243E` | menus, select lists, tooltips (dark tooltip: see §8) |
| `--muted` | `#EEF3F9` | `#1A2843` | inline code bg, tags, progress track |
| `--secondary` | `#E4EDFB` | `#1C2D4E` | soft button, filter chip, selected case |
| `--accent` | `#EAF1FC` | `#1C2D4E` | row hover, menu item highlight |
| `--border` | `#D9E2EE` | `#263755` | hairlines, card borders |
| `--border-strong` | `#B7C5D9` | `#3A4E73` | secondary-button border, resizer grip |
| `--input` | `#8293AE` | `#5A6E92` | form field border (≥3:1 vs field) |
| `--foreground` | `#14213D` | `#E7EDF7` | primary text |
| `--foreground-secondary` | `#3A4A66` | `#C3CEE2` | lead paragraphs, descriptions |
| `--muted-foreground` | `#56657F` | `#A0AEC8` | metadata, table headers |
| `--faint-foreground` | `#647189` | `#8C9AB6` | placeholders, captions (still ≥4.5:1) |
| `--primary` | `#2457C5` | `#5B8DEF` | primary action |
| `--primary-hover` | `#1C46A3` | `#7AA3F2` | |
| `--primary-active` | `#1A3B82` | `#9BBBF5` | |
| `--primary-foreground` | `#FFFFFF` | `#0B1630` | text on primary (dark mode uses dark text on light blue) |
| `--secondary-foreground` | `#1A3B82` | `#D5E2F9` | |
| `--accent-foreground` | `#1A3B82` | `#E7EDF7` | |
| `--link` | `#1D4FB8` | `#8DB4F5` | inline links |
| `--link-visited` | `#5B3FA8` | `#B9A5F0` | visited links in prose only |
| `--ring` | `#2457C5` | `#7AA3F2` | focus outline |
| `--header` | `#0E1A38` | `#091124` | masthead |
| `--header-foreground` | `#FFFFFF` | `#E7EDF7` | |
| `--header-muted` | `#B9C9E6` | `#A0AEC8` | inactive nav |
| `--gold` | `#C8922A` | `#D9A94A` | decorative rule |
| `--editor-bg` | `#FBFCFE` | `#0F1A2E` | Monaco / code viewer |

### 4.3 Semantic

| Token (fg / bg) | Light | Dark | Use |
|---|---|---|---|
| `--success` / `--success-bg` | `#16753A` / `#E7F5EC` | `#7BE0A6` / `#12301F` | solved, passed, success toast |
| `--warning` / `--warning-bg` | `#975A00` / `#FBF1DF` | `#E9B04F` / `#33270F` | attempted, warnings, "taking longer" |
| `--danger` / `--danger-bg` | `#C42B3C` / `#FCEBEC` | `#EE6D7B` / `#3A1820` | destructive, field errors, failed case |
| `--info` / `--info-bg` | `#1C46A3` / `#F3F7FD` | `#8DB4F5` / `#162847` | notes, follow-ups, neutral alerts |

shadcn `--destructive` = `--danger`.

### 4.4 Verdicts (DB status → UI)

Always render through one `<VerdictBadge status>` / `<VerdictLabel status>` component. Icons are lucide-react names.

| DB `status` | Label (exact copy) | Icon | Token | Light fg / bg | Dark fg / bg |
|---|---|---|---|---|---|
| `accepted` | Accepted | `CircleCheck` | `verdict-accepted` | `#16753A` / `#E7F5EC` | `#7BE0A6` / `#12301F` |
| `wrong_answer` | Wrong Answer | `CircleX` | `verdict-wrong` | `#C42B3C` / `#FCEBEC` | `#EE6D7B` / `#3A1820` |
| `time_limit` | Time Limit Exceeded | `Timer` | `verdict-tle` | `#975A00` / `#FBF1DF` | `#E9B04F` / `#33270F` |
| `memory_limit` | Memory Limit Exceeded | `MemoryStick` | `verdict-mle` | `#A0267F` / `#F9E9F4` | `#E68BD0` / `#351A33` |
| `runtime_error` | Runtime Error | `Bug` | `verdict-runtime` | `#B5410E` / `#FCEEE6` | `#F49A6B` / `#3A2016` |
| `compile_error` | Compile Error | `Braces` | `verdict-compile` | `#9B1C4C` / `#FAE8EE` | `#F07FA6` / `#3A1626` |
| `internal_error` | Internal Error | `ServerCrash` | `verdict-internal` | `#4F5B70` / `#EEF1F5` | `#A9B4C8` / `#1F2A3D` |
| `queued` | Queued | `Clock` | `verdict-queued` | `#56657F` / `#EEF3F9` | `#A0AEC8` / `#1A2843` |
| `running` | Running | `LoaderCircle` (spins, see §6.6) | `verdict-running` | `#1C46A3` / `#F3F7FD` | `#8DB4F5` / `#162847` |

Short labels for narrow table cells (<640px only): `TLE`, `MLE`, with `title` and `aria-label` set to the full label. A custom-input Run shows **"Output"** with no verdict label (PLAN §5). On failure it shows the error verdict as usual.

Problem status (catalog): `solved` → `CircleCheck` in `--success`, sr-text "Solved". `attempted` → `CircleDashed` in `--warning`, "Attempted". `todo` → `Circle` in `--input`, "Not started". The status column is hidden for guests.

### 4.5 Difficulty

| Level | Token | Light fg / bg | Dark fg / bg |
|---|---|---|---|
| Easy | `difficulty-easy` | `#0B7563` / `#E3F4F0` (teal, not the Accepted green) | `#4FCDB0` / `#0F2E2B` |
| Medium | `difficulty-medium` | `#975A00` / `#FBF1DF` | `#E9B04F` / `#33270F` |
| Hard | `difficulty-hard` | `#BE2550` / `#FCE9EE` | `#F37A9A` / `#3A1626` |

Difficulty is always written as a word ("Easy" / "Medium" / "Hard"). In tables it's colored text only. On the problem page and cards it's a tinted pill. Medium intentionally shares the warning amber with TLE. They never appear in the same component, and both always carry text.

### 4.6 Color-vision check (computed during the design audit)

Machado-2009 simulation at full severity, CIE76 ΔE (above ~10 means the colors are distinguishable without labels).

| Key pair | Light: normal / protan / deutan / tritan | Dark |
|---|---|---|
| Accepted vs Wrong Answer | 100.3 / 18.9 / 14.5 / 108.8 | 95.5 / 34.2 / 15.8 / 106.6 |
| Accepted vs Runtime Error | 89.3 / 15.4 / 31.4 / 99.4 | 74.7 / 18.8 / 25.8 / 86.2 |
| Easy vs Hard | 93.6 / 13.4 / 22.0 / 105.7 | 91.7 / 22.9 / 10.0 / 104.0 |
| Medium vs Hard | 56.3 / 48.2 / 31.0 / 35.2 | 65.1 / 63.0 / 47.4 / 25.1 |

Honest limit: across all 8 verdict colors, the minimum pairwise ΔE under deuteranopia is 1.5 in light (TLE vs Runtime) and 5.5 in dark. Nine statuses can't all be told apart by color alone, which is why §3.3 (icon + word) is mandatory, not optional. The pairs that matter most for the user (Accepted vs anything) stay at ΔE ≥ 14.

### 4.7 Contrast table (computed)

The rule: body text ≥ 4.5:1, UI boundaries and large text ≥ 3:1. **0 failures.** `tests/unit/contrast.test.ts` recomputes these pairs from `globals.css` (and the Monaco token table from `src/lib/monaco-themes.ts`) on every `pnpm test`; add new pairs there.

Key names in these tables: `v-*` = `--verdict-*` (`v-wrong` = `--verdict-wrong`), `d-*` = `--difficulty-*`; everything else matches the CSS variable name.

| Pair (fg on bg) | Need | Light | Dark |
|---|---|---|---|
| `foreground` on `background` | 4.5:1 (text) | #14213D / #FFFFFF = **15.97** OK | #E7EDF7 / #0D1628 = **15.36** OK |
| `foreground` on `card` | 4.5:1 (text) | #14213D / #FFFFFF = **15.97** OK | #E7EDF7 / #131F36 = **13.98** OK |
| `foreground` on `surface-sunken` | 4.5:1 (text) | #14213D / #F5F8FC = **15.00** OK | #E7EDF7 / #0A1222 = **15.91** OK |
| `foreground` on `muted` | 4.5:1 (text) | #14213D / #EEF3F9 = **14.32** OK | #E7EDF7 / #1A2843 = **12.50** OK |
| `foreground-secondary` on `background` | 4.5:1 (text) | #3A4A66 / #FFFFFF = **8.93** OK | #C3CEE2 / #0D1628 = **11.40** OK |
| `foreground-secondary` on `card` | 4.5:1 (text) | #3A4A66 / #FFFFFF = **8.93** OK | #C3CEE2 / #131F36 = **10.37** OK |
| `muted-foreground` on `background` | 4.5:1 (text) | #56657F / #FFFFFF = **5.89** OK | #A0AEC8 / #0D1628 = **8.07** OK |
| `muted-foreground` on `card` | 4.5:1 (text) | #56657F / #FFFFFF = **5.89** OK | #A0AEC8 / #131F36 = **7.35** OK |
| `muted-foreground` on `muted` | 4.5:1 (text) | #56657F / #EEF3F9 = **5.28** OK | #A0AEC8 / #1A2843 = **6.57** OK |
| `muted-foreground` on `surface-sunken` | 4.5:1 (text) | #56657F / #F5F8FC = **5.53** OK | #A0AEC8 / #0A1222 = **8.36** OK |
| `muted-foreground` on `accent` | 4.5:1 (text) | #56657F / #EAF1FC = **5.19** OK | #A0AEC8 / #1C2D4E = **6.11** OK |
| `faint-foreground` on `background` | 4.5:1 (text) | #647189 / #FFFFFF = **4.92** OK | #8C9AB6 / #0D1628 = **6.38** OK |
| `faint-foreground` on `card` | 4.5:1 (text) | #647189 / #FFFFFF = **4.92** OK | #8C9AB6 / #131F36 = **5.81** OK |
| `primary-foreground` on `primary` | 4.5:1 (text) | #FFFFFF / #2457C5 = **6.47** OK | #0B1630 / #5B8DEF = **5.55** OK |
| `primary-foreground` on `primary-hover` | 4.5:1 (text) | #FFFFFF / #1C46A3 = **8.56** OK | #0B1630 / #7AA3F2 = **7.13** OK |
| `primary-foreground` on `primary-active` | 4.5:1 (text) | #FFFFFF / #1A3B82 = **10.54** OK | #0B1630 / #9BBBF5 = **9.23** OK |
| `secondary-foreground` on `secondary` | 4.5:1 (text) | #1A3B82 / #E4EDFB = **8.94** OK | #D5E2F9 / #1C2D4E = **10.47** OK |
| `accent-foreground` on `accent` | 4.5:1 (text) | #1A3B82 / #EAF1FC = **9.28** OK | #E7EDF7 / #1C2D4E = **11.63** OK |
| `link` on `background` | 4.5:1 (text) | #1D4FB8 / #FFFFFF = **7.34** OK | #8DB4F5 / #0D1628 = **8.58** OK |
| `link` on `card` | 4.5:1 (text) | #1D4FB8 / #FFFFFF = **7.34** OK | #8DB4F5 / #131F36 = **7.82** OK |
| `link` on `surface-sunken` | 4.5:1 (text) | #1D4FB8 / #F5F8FC = **6.89** OK | #8DB4F5 / #0A1222 = **8.89** OK |
| `link-visited` on `background` | 4.5:1 (text) | #5B3FA8 / #FFFFFF = **7.72** OK | #B9A5F0 / #0D1628 = **8.35** OK |
| `primary` on `background` | 4.5:1 (text) | #2457C5 / #FFFFFF = **6.47** OK | #5B8DEF / #0D1628 = **5.59** OK |
| `primary` on `card` | 4.5:1 (text) | #2457C5 / #FFFFFF = **6.47** OK | #5B8DEF / #131F36 = **5.09** OK |
| `header-foreground` on `header` | 4.5:1 (text) | #FFFFFF / #0E1A38 = **17.16** OK | #E7EDF7 / #091124 = **15.98** OK |
| `header-muted` on `header` | 4.5:1 (text) | #B9C9E6 / #0E1A38 = **10.27** OK | #A0AEC8 / #091124 = **8.40** OK |
| `ring` on `background` | 3.0:1 (ui) | #2457C5 / #FFFFFF = **6.47** OK | #7AA3F2 / #0D1628 = **7.18** OK |
| `ring` on `card` | 3.0:1 (ui) | #2457C5 / #FFFFFF = **6.47** OK | #7AA3F2 / #131F36 = **6.54** OK |
| `input` on `background` | 3.0:1 (ui) | #8293AE / #FFFFFF = **3.12** OK | #5A6E92 / #0D1628 = **3.51** OK |
| `input` on `card` | 3.0:1 (ui) | #8293AE / #FFFFFF = **3.12** OK | #5A6E92 / #131F36 = **3.20** OK |
| `primary` on `background` | 3.0:1 (ui) | #2457C5 / #FFFFFF = **6.47** OK | #5B8DEF / #0D1628 = **5.59** OK |
| `success` on `success-bg` | 4.5:1 (text) | #16753A / #E7F5EC = **5.13** OK | #7BE0A6 / #12301F = **8.89** OK |
| `warning` on `warning-bg` | 4.5:1 (text) | #975A00 / #FBF1DF = **4.96** OK | #E9B04F / #33270F = **7.50** OK |
| `danger` on `danger-bg` | 4.5:1 (text) | #C42B3C / #FCEBEC = **4.85** OK | #EE6D7B / #3A1820 = **5.34** OK |
| `info` on `info-bg` | 4.5:1 (text) | #1C46A3 / #F3F7FD = **7.96** OK | #8DB4F5 / #162847 = **6.99** OK |
| `success` on `card` | 4.5:1 (text) | #16753A / #FFFFFF = **5.77** OK | #7BE0A6 / #131F36 = **10.22** OK |
| `warning` on `card` | 4.5:1 (text) | #975A00 / #FFFFFF = **5.56** OK | #E9B04F / #131F36 = **8.45** OK |
| `danger` on `card` | 4.5:1 (text) | #C42B3C / #FFFFFF = **5.59** OK | #EE6D7B / #131F36 = **5.57** OK |
| `v-accepted` on `v-accepted-bg` | 4.5:1 (text) | #16753A / #E7F5EC = **5.13** OK | #7BE0A6 / #12301F = **8.89** OK |
| `v-accepted` on `card` | 4.5:1 (text) | #16753A / #FFFFFF = **5.77** OK | #7BE0A6 / #131F36 = **10.22** OK |
| `v-accepted` on `background` | 4.5:1 (text) | #16753A / #FFFFFF = **5.77** OK | #7BE0A6 / #0D1628 = **11.23** OK |
| `v-wrong` on `v-wrong-bg` | 4.5:1 (text) | #C42B3C / #FCEBEC = **4.85** OK | #EE6D7B / #3A1820 = **5.34** OK |
| `v-wrong` on `card` | 4.5:1 (text) | #C42B3C / #FFFFFF = **5.59** OK | #EE6D7B / #131F36 = **5.57** OK |
| `v-wrong` on `background` | 4.5:1 (text) | #C42B3C / #FFFFFF = **5.59** OK | #EE6D7B / #0D1628 = **6.12** OK |
| `v-tle` on `v-tle-bg` | 4.5:1 (text) | #975A00 / #FBF1DF = **4.96** OK | #E9B04F / #33270F = **7.50** OK |
| `v-tle` on `card` | 4.5:1 (text) | #975A00 / #FFFFFF = **5.56** OK | #E9B04F / #131F36 = **8.45** OK |
| `v-tle` on `background` | 4.5:1 (text) | #975A00 / #FFFFFF = **5.56** OK | #E9B04F / #0D1628 = **9.28** OK |
| `v-mle` on `v-mle-bg` | 4.5:1 (text) | #A0267F / #F9E9F4 = **5.84** OK | #E68BD0 / #351A33 = **6.66** OK |
| `v-mle` on `card` | 4.5:1 (text) | #A0267F / #FFFFFF = **6.82** OK | #E68BD0 / #131F36 = **7.02** OK |
| `v-mle` on `background` | 4.5:1 (text) | #A0267F / #FFFFFF = **6.82** OK | #E68BD0 / #0D1628 = **7.71** OK |
| `v-runtime` on `v-runtime-bg` | 4.5:1 (text) | #B5410E / #FCEEE6 = **4.97** OK | #F49A6B / #3A2016 = **6.92** OK |
| `v-runtime` on `card` | 4.5:1 (text) | #B5410E / #FFFFFF = **5.63** OK | #F49A6B / #131F36 = **7.58** OK |
| `v-runtime` on `background` | 4.5:1 (text) | #B5410E / #FFFFFF = **5.63** OK | #F49A6B / #0D1628 = **8.33** OK |
| `v-compile` on `v-compile-bg` | 4.5:1 (text) | #9B1C4C / #FAE8EE = **6.70** OK | #F07FA6 / #3A1626 = **6.27** OK |
| `v-compile` on `card` | 4.5:1 (text) | #9B1C4C / #FFFFFF = **7.88** OK | #F07FA6 / #131F36 = **6.49** OK |
| `v-compile` on `background` | 4.5:1 (text) | #9B1C4C / #FFFFFF = **7.88** OK | #F07FA6 / #0D1628 = **7.13** OK |
| `v-internal` on `v-internal-bg` | 4.5:1 (text) | #4F5B70 / #EEF1F5 = **6.05** OK | #A9B4C8 / #1F2A3D = **6.90** OK |
| `v-internal` on `card` | 4.5:1 (text) | #4F5B70 / #FFFFFF = **6.86** OK | #A9B4C8 / #131F36 = **7.87** OK |
| `v-internal` on `background` | 4.5:1 (text) | #4F5B70 / #FFFFFF = **6.86** OK | #A9B4C8 / #0D1628 = **8.64** OK |
| `v-queued` on `v-queued-bg` | 4.5:1 (text) | #56657F / #EEF3F9 = **5.28** OK | #A0AEC8 / #1A2843 = **6.57** OK |
| `v-queued` on `card` | 4.5:1 (text) | #56657F / #FFFFFF = **5.89** OK | #A0AEC8 / #131F36 = **7.35** OK |
| `v-queued` on `background` | 4.5:1 (text) | #56657F / #FFFFFF = **5.89** OK | #A0AEC8 / #0D1628 = **8.07** OK |
| `v-running` on `v-running-bg` | 4.5:1 (text) | #1C46A3 / #F3F7FD = **7.96** OK | #8DB4F5 / #162847 = **6.99** OK |
| `v-running` on `card` | 4.5:1 (text) | #1C46A3 / #FFFFFF = **8.56** OK | #8DB4F5 / #131F36 = **7.82** OK |
| `v-running` on `background` | 4.5:1 (text) | #1C46A3 / #FFFFFF = **8.56** OK | #8DB4F5 / #0D1628 = **8.58** OK |
| `d-easy` on `d-easy-bg` | 4.5:1 (text) | #0B7563 / #E3F4F0 = **4.94** OK | #4FCDB0 / #0F2E2B = **7.39** OK |
| `d-easy` on `card` | 4.5:1 (text) | #0B7563 / #FFFFFF = **5.62** OK | #4FCDB0 / #131F36 = **8.37** OK |
| `d-easy` on `background` | 4.5:1 (text) | #0B7563 / #FFFFFF = **5.62** OK | #4FCDB0 / #0D1628 = **9.20** OK |
| `d-easy` on `surface-sunken` | 4.5:1 (text) | #0B7563 / #F5F8FC = **5.27** OK | #4FCDB0 / #0A1222 = **9.52** OK |
| `d-easy` on `accent` | 4.5:1 (text) | #0B7563 / #EAF1FC = **4.94** OK | #4FCDB0 / #1C2D4E = **6.97** OK |
| `d-medium` on `d-medium-bg` | 4.5:1 (text) | #975A00 / #FBF1DF = **4.96** OK | #E9B04F / #33270F = **7.50** OK |
| `d-medium` on `card` | 4.5:1 (text) | #975A00 / #FFFFFF = **5.56** OK | #E9B04F / #131F36 = **8.45** OK |
| `d-medium` on `background` | 4.5:1 (text) | #975A00 / #FFFFFF = **5.56** OK | #E9B04F / #0D1628 = **9.28** OK |
| `d-medium` on `surface-sunken` | 4.5:1 (text) | #975A00 / #F5F8FC = **5.22** OK | #E9B04F / #0A1222 = **9.61** OK |
| `d-medium` on `accent` | 4.5:1 (text) | #975A00 / #EAF1FC = **4.89** OK | #E9B04F / #1C2D4E = **7.03** OK |
| `d-hard` on `d-hard-bg` | 4.5:1 (text) | #BE2550 / #FCE9EE = **5.05** OK | #F37A9A / #3A1626 = **6.09** OK |
| `d-hard` on `card` | 4.5:1 (text) | #BE2550 / #FFFFFF = **5.88** OK | #F37A9A / #131F36 = **6.31** OK |
| `d-hard` on `background` | 4.5:1 (text) | #BE2550 / #FFFFFF = **5.88** OK | #F37A9A / #0D1628 = **6.93** OK |
| `d-hard` on `surface-sunken` | 4.5:1 (text) | #BE2550 / #F5F8FC = **5.52** OK | #F37A9A / #0A1222 = **7.18** OK |
| `d-hard` on `accent` | 4.5:1 (text) | #BE2550 / #EAF1FC = **5.18** OK | #F37A9A / #1C2D4E = **5.25** OK |

One-off pairs from DESIGN.md §8:

| Where | fg / bg | Ratio |
|---|---|---|
| light destructive button | #FFFFFF / #C42B3C | **5.59** OK |
| light destructive hover | #FFFFFF / #A82333 | **7.11** OK |
| dark destructive button | #2A0B10 / #EE6D7B | **6.16** OK |
| dark destructive hover | #2A0B10 / #F28A95 | **7.67** OK |
| light tooltip | #FFFFFF / #14213D | **15.97** OK |
| dark tooltip | #0D1628 / #E7EDF7 | **15.36** OK |
| light avatar | #192F63 / #C8DAF6 | **9.10** OK |
| dark avatar | #E7EDF7 / #2B4677 | **7.95** OK |
| light header Sign up (blue-800 on white) | #1A3B82 / #FFFFFF | **10.54** OK |
| light inactive nav | #B9C9E6 / #0E1A38 | **10.27** OK |
| logo chevrons (decorative) | #FFFFFF / #2457C5 | **6.47** OK |
| light selected case pill | #1A3B82 / #E4EDFB | **8.94** OK |
| dark selected case pill | #D5E2F9 / #1C2D4E | **10.47** OK |
| light wrong output block | #C42B3C / #FCEBEC | **4.85** OK |
| dark wrong output block | #EE6D7B / #3A1820 | **5.34** OK |
| light IO value on sunken | #14213D / #F5F8FC | **15.00** OK |
| dark IO value on sunken | #E7EDF7 / #0A1222 | **15.91** OK |
| dark selection text | #E7EDF7 / #264272 | **8.48** OK |
| light selection text | #0E1A38 / #C8DAF6 | **12.11** OK |

Blue scale vs white (#FFFFFF) and vs blue-950:

| Step | Hex | on white | on 950 |
|---|---|---|---|
| 50 | #F3F7FD | 1.08 | 15.96 |
| 100 | #E4EDFB | 1.18 | 14.55 |
| 200 | #C8DAF6 | 1.42 | 12.11 |
| 300 | #9DBCEE | 1.93 | 8.88 |
| 400 | #6C98E3 | 2.90 | 5.92 |
| 500 | #3F73D6 | 4.53 | 3.79 |
| 600 | #2457C5 | 6.47 | 2.65 |
| 700 | #1C46A3 | 8.56 | 2.01 |
| 800 | #1A3B82 | 10.54 | 1.63 |
| 900 | #192F63 | 12.90 | 1.33 |
| 950 | #0E1A38 | 17.16 | 1.00 |

FAILS: 0
#### Monaco token contrast (vs editor background)

| Token | Light | Dark |
|---|---|---|
| fg | #14213D = **15.56** OK | #E7EDF7 = **14.79** OK |
| comment | #5B6A82 = **5.34** OK | #8C9AB6 = **6.14** OK |
| keyword | #1C46A3 = **8.34** OK | #8DB4F5 = **8.26** OK |
| string | #0B6E5C = **6.02** OK | #4FCDB0 = **8.85** OK |
| number | #8F5500 = **5.90** OK | #E9B04F = **8.93** OK |
| function | #8A2378 = **7.89** OK | #E3A2EA = **8.80** OK |
| type | #0E6577 = **6.50** OK | #6FD3E8 = **10.07** OK |
| operator | #3A4A66 = **8.70** OK | #C3CEE2 = **10.97** OK |
| lineNumber | #647189 = **4.80** OK | #7F8FAD = **5.33** OK |
| lineNumberActive | #14213D = **15.56** OK | #E7EDF7 = **14.79** OK |
| constant | #B5410E = **5.49** OK | #F49A6B = **8.02** OK |

#### CVD: minimum pairwise CIE76 dE between colors in a group (higher = more distinct; <10 = hard to tell apart by color alone)

| Group | Theme | normal | protan | deutan | tritan | closest pair (deutan) |
|---|---|---|---|---|---|---|
| verdicts | light | 25.6 | 5.0 | 1.5 | 10.1 | v-tle vs v-runtime |
| verdicts | dark | 18.6 | 11.2 | 5.5 | 10.1 | v-mle vs v-internal |
| difficulty | light | 56.3 | 13.4 | 22.0 | 35.2 | d-easy vs d-hard |
| difficulty | dark | 65.1 | 22.9 | 10.0 | 25.1 | d-easy vs d-hard |

Monaco FAILS: 0

#### CVD: key pairs that must stay apart (CIE76 dE, normal / protan / deutan / tritan)

| Pair | Light | Dark |
|---|---|---|
| v-accepted vs v-wrong | 100.3 / 18.9 / 14.5 / 108.8 | 95.5 / 34.2 / 15.8 / 106.6 |
| v-accepted vs v-runtime | 89.3 / 15.4 / 31.4 / 99.4 | 74.7 / 18.8 / 25.8 / 86.2 |
| v-accepted vs v-tle | 66.0 / 17.2 / 30.4 / 70.6 | 65.3 / 33.7 / 40.5 / 74.8 |
| d-easy vs d-hard | 93.6 / 13.4 / 22.0 / 105.7 | 91.7 / 22.9 / 10.0 / 104.0 |
| d-easy vs d-medium | 72.0 / 41.7 / 52.7 / 70.6 | 74.1 / 47.3 / 56.0 / 81.5 |
| d-medium vs d-hard | 56.3 / 48.2 / 31.0 / 35.2 | 65.1 / 63.0 / 47.4 / 25.1 |
| v-running vs v-accepted | 101.3 / 83.8 / 79.7 / 20.9 | 72.7 / 61.2 / 55.3 / 18.2 |


---

## 5. Typography

### 5.1 Families (all via `next/font/google`, self-hosted at build, no runtime CDN)

```ts
// src/app/fonts.ts
import { JetBrains_Mono, Source_Sans_3, Source_Serif_4 } from "next/font/google";
export const fontSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });
export const fontSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", axes: ["opsz"], display: "swap" });
export const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });
```
`<html className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} h-full antialiased`}>` replaces Geist. All three are variable fonts, so no `weight` list is needed.

**Ligatures off for code**: `font-variant-ligatures: none` on `code, pre, kbd, .font-mono`, and `fontLigatures: false` in Monaco. JetBrains Mono otherwise renders `<=` as `≤` and `->` as an arrow, which confuses learners copying constraints. (We caught this in the first preview pass.)

### 5.2 Scale

| Style | Family | Size / line-height | Weight | Tracking | Tailwind |
|---|---|---|---|---|---|
| Display | serif | 52/60 (≤640px: 36/44) | 600 | -0.02em | `font-heading text-4xl/11 sm:text-[3.25rem]/[3.75rem] font-semibold tracking-[-0.02em] text-balance` |
| H1 | serif | 36/44 (≤640px: 30/38) | 600 | -0.015em | `font-heading text-3xl/[2.375rem] sm:text-4xl/11 font-semibold tracking-[-0.015em]` |
| H2 | serif | 28/36 (≤640px: 24/32) | 600 | -0.01em | `font-heading text-2xl/8 sm:text-[1.75rem]/9 font-semibold tracking-[-0.01em]` |
| Problem title | serif | 26/34 | 600 | -0.01em | `font-heading text-[1.625rem]/[2.125rem] font-semibold` |
| H3 | sans | 20/28 | 600 | 0 | `text-xl/7 font-semibold` |
| H4 | sans | 17/24 | 600 | 0 | `text-[1.0625rem]/6 font-semibold` |
| Lead | sans | 19/30 | 400 | 0 | `text-[1.1875rem]/[1.875rem] text-foreground-secondary` |
| Body | sans | 16/26 | 400 | 0 | `text-base/[1.625rem]` |
| Small / UI | sans | 14/20 (buttons 15) | 400–600 | 0 | `text-sm` |
| Caption | sans | 12/16 | 500 | 0.01em | `text-xs text-muted-foreground` |
| Eyebrow / table header | sans | 12–12.5/16 | 600 | 0.04–0.08em, uppercase | `text-xs font-semibold uppercase tracking-[0.08em]` |
| Code (editor, blocks) | mono | 14/22 | 400 | 0 | `font-mono text-sm/[1.375rem]` |
| Inline code | mono | 0.875em | 400 | 0 | see prose |

Numbers in tables, stats and metrics use `tabular-nums`. Max line length is 72ch for prose and 34rem for hero lead text.

### 5.3 Problem statement prose (`.prose-problem`, applied to the react-markdown root)

Write this as a small CSS block in `globals.css` under `@layer components` (no `@tailwindcss/typography` dependency):

```css
@layer components {
  .prose-problem { max-width: 72ch; font-size: 1rem; line-height: 1.625rem; color: var(--foreground); }
  .prose-problem > * + * { margin-top: 1rem; }
  .prose-problem h1, .prose-problem h2 { font: 600 1.25rem/1.75rem var(--font-sans); margin-top: 2rem; }
  .prose-problem h3, .prose-problem h4 { font: 600 1rem/1.5rem var(--font-sans); margin-top: 1.75rem; }
  .prose-problem a { color: var(--link); text-decoration: underline; text-underline-offset: 3px; }
  .prose-problem strong { font-weight: 600; }
  .prose-problem ul, .prose-problem ol { padding-left: 1.375rem; }
  .prose-problem ul { list-style: disc; } .prose-problem ol { list-style: decimal; }
  .prose-problem li + li { margin-top: .25rem; }
  .prose-problem li::marker { color: var(--primary); }
  .prose-problem :not(pre) > code { font-family: var(--font-mono); font-size: .875em; background: var(--muted);
    border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; font-variant-ligatures: none; }
  .prose-problem pre { font: 400 .875rem/1.375rem var(--font-mono); background: var(--surface-sunken);
    border: 1px solid var(--border); border-left: 3px solid var(--color-blue-300); border-radius: 0 6px 6px 0;
    padding: .75rem 1rem; overflow-x: auto; font-variant-ligatures: none; }
  .dark .prose-problem pre { border-left-color: var(--color-blue-700); }
  .prose-problem pre code { background: none; border: 0; padding: 0; font-size: inherit; }
  .prose-problem blockquote { display: block; background: var(--info-bg); border: 1px solid var(--color-blue-200);
    border-radius: 6px; padding: .75rem 1rem; color: var(--foreground); }
  .dark .prose-problem blockquote { border-color: var(--color-blue-800); }
  .prose-problem table { width: 100%; border-collapse: collapse; font-size: .9375rem; }
  .prose-problem th { text-align: left; font-weight: 600; background: var(--surface-sunken); }
  .prose-problem th, .prose-problem td { border: 1px solid var(--border); padding: .5rem .75rem; }
  .prose-problem hr { border: 0; border-top: 1px solid var(--border); margin: 2rem 0; }
  .prose-problem sup { font-size: .75em; }
}
```
Content rules for authors (`problems/*/description.md`): use `### Example 1` and `### Constraints` headings. Examples go in a fenced block with `Input:` / `Output:` / `Explanation:` lines. Constraints are a bullet list of inline-code items (`` `2 <= nums.length <= 10^4` ``). A follow-up goes in a blockquote starting with `**Follow-up.**`. The sample Input/Output blocks rendered from `tests.json` (AC-M3-4) reuse the `pre` style with a sans `Input` / `Output` label above them (`text-sm font-semibold`).

---

## 6. Space, shape, layout, motion

### 6.1 Spacing
Tailwind default 4px grid. Allowed rhythm: 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 88. Card padding is 24px (`p-6`), 16px for compact cards. Section vertical padding on marketing pages is 88px desktop and 56px mobile (`py-14 md:py-22`). Form field gap is 16px, label-to-input gap 6px.

### 6.2 Radius
`--radius: 0.5rem` (8px), so `rounded-sm` 4.8px, `rounded-md` 6.4px, `rounded-lg` 8px, `rounded-xl` 11.2px. Usage: buttons, inputs, selects and IO blocks `rounded-md`; cards, panes, tables and dialogs `rounded-lg`; tags `rounded-sm`; badges and progress bars `rounded-full`. Nothing above `rounded-xl`.

### 6.3 Borders and elevation
Borders are 1px `--border`. Form fields use `--input`, secondary buttons `--border-strong`.
```
--shadow-xs: 0 1px 2px rgb(14 26 56 / .06)                                 buttons, cards, tables
--shadow-sm: 0 1px 3px rgb(14 26 56 / .08), 0 1px 2px rgb(14 26 56 / .04)
--shadow-md: 0 4px 12px -2px rgb(14 26 56 / .10), 0 2px 4px -2px rgb(14 26 56 / .06)  menus, popovers, mobile action bar
--shadow-lg: 0 16px 40px -12px rgb(14 26 56 / .22)                        dialogs, hero illustration
dark: xs 0 1px 2px rgb(0 0 0/.3) · sm 0 1px 3px rgb(0 0 0/.35) · md 0 6px 16px -4px rgb(0 0 0/.45) · lg 0 18px 44px -12px rgb(0 0 0/.6)
```
In dark mode, elevation comes mostly from surface lightness (background < card < popover) plus the border.

### 6.4 Layout grid, containers, breakpoints
- Container: `mx-auto w-full max-w-[1200px] px-4 sm:px-6` (this replaces the current `max-w-6xl px-4`; 1152 → 1200).
- Narrow containers: auth `max-w-[400px]`, prose pages `max-w-3xl`.
- Grid: 12 columns, 24px gutter (`gap-6`) desktop, 16px mobile.
- Breakpoints: Tailwind defaults `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Behavior changes at `md` (problem page split ↔ tabs, AC-M3-6; table ↔ card list; header nav ↔ menu button) and at `lg` (catalog sidebar).
- Problem page is full-bleed: `h-[calc(100dvh-52px)]`, 8px canvas padding, panes are cards.
- Minimum supported width is 360px (AC-M0-7).

### 6.5 Header heights
Marketing and app pages: 64px plus a 3px rule (gold 64px, then `--primary`). Problem page: compact 52px plus 3px. Dark mode: 2px rule, gold segment only, plus `border-b`.

### 6.6 Motion

Tokens (`:root` in `globals.css`, mirrored in `src/lib/motion.ts` for JS):

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 120ms | hover/press color changes, button press scale |
| `--duration-base` | 180ms | menus, tooltips, select, tab indicator |
| `--duration-slow` | 260ms | dialogs, sheet, toasts, section enter |
| `--motion-ease-out` / Tailwind `ease-out` | `cubic-bezier(.2,.8,.2,1)` | enter |
| `--motion-ease-in` / Tailwind `ease-in` | `cubic-bezier(.4,0,1,1)` | exit |
| `--motion-distance` | 8px (0 under reduced motion) | rise of enter animations |

Rules: animate only `transform` and `opacity` (plus colors on hover). Never animate width, height, top/left, margin or padding. Durations stay within 120–300 ms. No autoplay loops while reading; the only loops are loading indicators (spinner, skeleton shimmer). No animation libraries: CSS plus `tw-animate-css` (already used by the shadcn popups).

What moves:
- **Section/page enter**: `<Reveal>` (`src/components/motion/reveal.tsx`) or the `.reveal` class: fade + 8px rise, 260 ms, staggered by 60 ms per index (index clamped at 8). CSS-only, so it works in server components. Used on page heads, landing sections and list items, the 404, auth card and empty states.
- **Buttons**: color transitions (120 ms) and a 2% press scale (`motion-safe:active:scale-[0.98]`, not on menu triggers).
- **Interactive cards** (`<Card interactive>`): border/shadow change plus a 2px lift on hover.
- **Menus, select, tooltip**: fade + zoom from 95%, 180 ms in / 120 ms out. **Dialogs**: 260 ms in / 180 ms out. **Sheet**: slides from its side, 260 ms.
- **Tabs**: the 2px indicator slides with `translateX` (`Tabs.Indicator` CSS vars); its width snaps.
- **Progress bars**: fill on mount via `transform: translateX()` of a full-width bar (`.progress-indicator`), 300 ms, optional stagger (`delayMs`).
- **Skeleton**: a light band slides across (`.skeleton-shimmer`, transform only).
- **Theme toggle**: the visible sun/moon icon rotates and scales in (`animate-icon-in`); a CSS animation restarts on the display change, so it still plays while next-themes disables transitions (`disableTransitionOnChange` stays).
- **Hero sheets** on the landing page enter one after another (120/220/320 ms delays).
- **Spinner** (`LoaderCircle`): `animate-spin-slow` (0.9 s linear).

`prefers-reduced-motion: reduce`: `--motion-distance` becomes 0, every animation and transition runs in 0.01 ms with no delay (state changes stay, instantly), the skeleton shimmer is hidden, and the running spinner becomes a static `Clock` (`VerdictIcon` renders both and toggles with `motion-reduce:`). Use the `motion-safe:` variant for any new movement.

Reveal usage:

```tsx
import { Reveal } from "@/components/motion/reveal";

<Reveal>…section…</Reveal>
<Reveal as="section" className="py-14">…</Reveal>
<ol>{items.map((x, i) => <Reveal as="li" index={i} key={x.id}>…</Reveal>)}</ol>

// Own element: same effect without the wrapper.
<div className="reveal" style={revealStyle(i, 120)} />   // from "@/lib/motion"
```

Do not wrap elements that update often (console output, polling results) in `Reveal`: it replays only on mount, but a remounting list would re-animate.

## 7. Iconography and imagery

- lucide-react only. Sizes: 16px inline with text (`size-4`), 20px for status in tables and the header (`size-5`), 14px inside badges (`size-3.5`), 22px for the verdict heading. Stroke 2 (default); 1.75 at 20px+ is allowed. Icons inherit `currentColor`.
- Icon-only buttons need `aria-label` and a Tooltip. Decorative icons get `aria-hidden`.
- No emoji anywhere in the UI. No icon-in-colored-circle feature grids.
- Brand mark: a 28×28 rounded square (`rx 6`) in `#2457C5`, white `< >` chevrons, a 1.8px old-gold dot in the center, and the wordmark "LemmaYard" in Source Serif 4 600. Inline SVG: `src/components/brand/logo.tsx` (`Logo`, `LogoMark`).
- Landing imagery uses CSS/SVG only. (1) A "graph paper" grid (32px, `--border` lines) masked to fade in from the right side of the hero. (2) Staggered paper "sheets", real mini components (problem card, code card, verdict card) with `--shadow-lg`: offset left/right/left with a 16px gap, never overlapping. The code card sizes to its longest line and never clips it (a product that teaches code shows complete code); below 400px the sample drops to 11px so it fits a 360px screen. The first previews cropped the `return` line at 1024–1440px; they are superseded. (3) Serif numerals (`01 02 03`) and numbered step dots joined by a 2px rule. No stock photos, no blobs, no gradients other than the masthead rule.

---

## 8. Components

The repo already has `button`, `card`, `dropdown-menu`, `input` and `label` in `src/components/ui/` (Base UI flavored shadcn, `base-nova`). Add the rest with `pnpm dlx shadcn@latest add <name>` and then apply the class changes below. All interactive targets are ≥40px tall, except toolbar `sm` buttons (32px) inside the 52px problem toolbar. Those get an invisible hit-area extension (`relative after:absolute after:-inset-1`) so they reach 40px.

Focus everywhere: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`. This replaces shadcn's `ring-3 ring-ring/50`, which at 50% alpha reaches only ~2.3:1 against white. Inputs use `focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25` plus the border change (the border change carries the 3:1).

### 8.1 Button (`ui/button.tsx`, change)
| Variant | Default | Hover | Active | Notes |
|---|---|---|---|---|
| `default` (primary) | `bg-primary text-primary-foreground shadow-xs` | `bg-primary-hover` | `bg-primary-active` | replace `hover:bg-primary/80` |
| `secondary` (bordered, white) | `bg-card text-foreground border-border-strong shadow-xs` | `bg-accent border-input` | `bg-secondary` | used for Run and "Browse problems". The current shadcn `outline` becomes this; keep `outline` as an alias |
| `soft` (new) | `bg-secondary text-secondary-foreground` | `bg-blue-200 dark:bg-[#24385F]` | | filter chips, low-emphasis actions |
| `ghost` | `text-foreground-secondary` | `bg-muted text-foreground` | | Reset, icon buttons |
| `destructive` | `bg-danger text-white dark:text-[#2A0B10]` | `bg-[#A82333] dark:bg-[#F28A95]` | | confirm-reset dialog only. Solid fill (shadcn's 10% tint fails contrast as a button) |
| `link` | `text-link underline-offset-4 hover:underline` | | | |

Sizes: `sm` h-8 px-3 text-sm; `default` **h-10** px-4 text-[0.9375rem] font-semibold; `lg` h-12 px-[22px] text-base; `icon` size-10; `icon-sm` size-8. Base: `rounded-md gap-2`. No `active:translate-y-px` (jittery in the dense toolbar); press feedback is a 2% scale instead (§6.6).
States: disabled `opacity-50 cursor-not-allowed`. Loading: `aria-busy="true" disabled`, label kept, a leading `LoaderCircle animate-spin` replaces the icon (e.g. "Running…", "Submitting…"). Keyboard hint: a trailing `<kbd>` in the tooltip, not on the button.

### 8.2 Form fields
- `Input` (change): `h-10 rounded-md border-input bg-card px-3 text-[0.9375rem] placeholder:text-faint-foreground`. Hover `border-muted-foreground`. Focus as above. `aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/20`. Disabled `bg-muted opacity-60`. Search variant: leading `Search` icon at `left-3`, `pl-9`.
- `Textarea` (add): same as Input, `min-h-28 py-2 font-mono text-sm` when used for custom testcase JSON.
- `Select` (add, Base UI): trigger identical to Input, with `ChevronDown` in `text-muted-foreground`. Popup is `bg-popover rounded-lg shadow-md ring-1 ring-border p-1`, items `h-9 rounded-sm px-2` with highlight `bg-accent`, and the selected item gets a `Check` icon.
- `Label` (change): `text-sm font-semibold text-foreground`.
- Help text: `text-sm text-muted-foreground mt-1.5`, linked via `aria-describedby`.
- Error text: `text-sm text-danger mt-1.5 flex gap-1.5` with `CircleAlert size-4`, `role="alert"` only for form-level errors. Field-level errors are linked via `aria-describedby` + `aria-invalid`.

### 8.3 Card (`ui/card.tsx`, change)
`rounded-lg border border-border bg-card shadow-xs`, replacing `ring-1 ring-foreground/10 rounded-xl`. `--card-spacing: 24px` (default) / 16px (sm). `CardTitle`: `font-sans text-lg/7 font-semibold` (cards are UI, not headings with serif). `CardFooter`: `bg-surface-sunken border-t`. Interactive cards (featured problem): `hover:border-border-strong hover:shadow-sm`, with the whole card as a link and a visible focus outline.

### 8.4 Badge / chip family (`ui/badge.tsx` add + `components/judge/verdict-badge.tsx`, `components/problems/difficulty-badge.tsx`)
- Base: `inline-flex items-center gap-1 h-6 px-2 rounded-full text-[0.78rem] font-semibold whitespace-nowrap`.
- `verdict` variants: `bg-verdict-{x}-bg text-verdict-{x}`, with the icon at `size-3.5`.
- `difficulty` variants: `bg-difficulty-{x}-bg text-difficulty-{x}`. Table variant: text only (`text-sm font-semibold text-difficulty-{x}`).
- `tag` (topic): `h-6 rounded-sm px-2 bg-muted text-foreground-secondary text-[0.78rem] font-medium`. As a link: `hover:bg-secondary hover:text-secondary-foreground`.
- `outline`: `border border-border-strong text-foreground-secondary font-medium`.
- Filter chip (removable): `h-7 rounded-full bg-secondary text-secondary-foreground pl-2.5 pr-1.5` + `X size-3.5` button, `aria-label="Remove filter: Easy"`.

### 8.5 Table (`ui/table.tsx`, add)
- Wrapper: `overflow-x-auto rounded-lg border bg-card shadow-xs`.
- `th`: `h-10 px-4 bg-surface-sunken text-left text-[0.78rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground border-b`.
- `td`: `h-12 px-4 border-b text-[0.9375rem]` (catalog). The dense variant `data-density="compact"` uses `h-10 text-sm` (submissions).
- Zebra: `even:bg-surface-sunken dark:even:bg-white/[0.02]`. Hover: `hover:bg-accent`.
- Numbers: `text-right tabular-nums`. `#` column muted.
- Sortable header: the header is a `<button>` (full cell, `inline-flex gap-1`) with `ArrowUpDown size-3.5` (unsorted), `ArrowUp` or `ArrowDown` (sorted), and `aria-sort` on the `th`. Not required by the PLAN ACs; build it only if sorting is added.
- Row link: only the title is a link (`font-medium text-foreground hover:text-link hover:underline`). Don't make the whole row clickable, because that breaks middle-click and screen readers.
- Empty state replaces tbody (see §8.13).

### 8.6 Tabs (`ui/tabs.tsx`, add, Base UI)
Underline style. List `flex gap-0.5 border-b`. Trigger `h-10 px-3 inline-flex gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground`. Selected `text-foreground font-semibold shadow-[inset_0_-2px_0_var(--primary)]`. Optional icon `size-4`. Keyboard: arrow keys (Base UI default). Mobile problem tabs: `flex-1 justify-center h-11`.

### 8.7 Dropdown menu (`ui/dropdown-menu.tsx`, change)
Content `rounded-lg bg-popover p-1 shadow-md ring-1 ring-border min-w-48`. Item `h-9 rounded-sm px-2 gap-2 text-sm`, highlight `bg-accent text-accent-foreground`. Destructive item ("Log out") stays neutral text with a `LogOut` icon; no red. Separator `my-1 h-px bg-border`. Label `px-2 py-1.5 text-xs font-semibold text-muted-foreground`.

### 8.8 Tooltip (`ui/tooltip.tsx`, add)
`rounded-md bg-[#14213D] text-white dark:bg-[#E7EDF7] dark:text-[#0D1628] px-2 py-1 text-xs font-medium shadow-md`. Opens after 400ms, closes at once. Content example: `Run · <kbd>Ctrl</kbd> <kbd>Enter</kbd>` (use `⌘` on macOS via `navigator.platform` check). `kbd`: `font-mono text-[11px] rounded-sm border border-current/40 px-1`.

### 8.9 Dialog (`ui/dialog.tsx` + `ui/alert-dialog.tsx`, add)
Overlay `bg-[#0E1A38]/50 dark:bg-black/60`. Panel `max-w-md rounded-lg bg-popover p-6 shadow-lg border`. Title `text-lg font-semibold` (sans). Footer `flex justify-end gap-2 mt-6`. Reset confirm (AC-M5-2): title "Reset to the starter code?", body "Your current Python 3 code for this problem will be replaced. This can't be undone.", actions `secondary` "Cancel" and `destructive` "Reset code". Focus goes to Cancel.

### 8.10 Toast (`sonner` via `ui/sonner.tsx`, add)
Bottom-right desktop, top-center mobile. `rounded-lg bg-popover border shadow-md text-sm`, with a leading status icon in the semantic color. Used for: rate limit 429 ("Too many runs. Try again in 12 s."), network errors and "Code reset". Never used for verdicts (verdicts live in the console).

### 8.11 Progress (`ui/progress.tsx`, add)
Track `h-2 rounded-full bg-muted`, indicator `rounded-full bg-primary` (or `bg-difficulty-{x}` on the profile). `role="progressbar" aria-valuenow aria-valuemax aria-label="Easy: 10 of 16 solved"`. Always show the numbers next to it (`10 / 16`, tabular).

### 8.12 Skeleton (`ui/skeleton.tsx`, add)
`rounded-md bg-muted animate-pulse`. Shapes mirror the content: table rows (h-12 bars at 60/20/10%), problem description (title bar 40% × 28px, then 6 text bars at 100/95/90/70% × 14px), and the editor (a block plus a gutter stripe). Wrap in `aria-busy="true"` with an sr-only "Loading…".

### 8.13 Empty state (`components/empty-state.tsx`, add)
Centered in its container, `py-16 text-center`. A 40px lucide icon in `text-muted-foreground` inside a `size-16 rounded-full bg-muted` (the only allowed icon-in-circle), a title `text-lg font-semibold`, a body `text-muted-foreground max-w-sm`, and an optional action button. Copy examples: catalog with filters → "No problems match these filters" + `secondary` "Clear filters". Submissions → "No submissions yet" + "Browse problems". Profile → "No solved problems yet".

### 8.14 Alert (`ui/alert.tsx`, add)
`rounded-md border px-4 py-3 text-sm flex gap-3` with variants info / success / warning / danger: `bg-{s}-bg text-foreground border-{s}/30`, icon `text-{s}`. Title `font-semibold`. Used for the form-level login error "Invalid email or password", the judge-unavailable notice (AC-M5-10) and "Taking longer than expected".

### 8.15 Avatar (`ui/avatar.tsx`, add)
Initials only (no uploads in MVP). `size-8 rounded-full bg-blue-200 text-blue-900 dark:bg-[#2B4677] dark:text-[#E7EDF7] text-[13px] font-semibold`; profile header `size-16 text-xl`. Initials = first two characters of the username, uppercased.

### 8.16 Pagination (`components/pagination.tsx`, add; links, not buttons, since `?page=` lives in the URL)
Row `flex justify-between items-center`: left "Showing 21–40 of 45" (`text-sm text-muted-foreground tabular-nums`), right page links. Each link `min-w-10 h-10 rounded-md border border-border-strong bg-card text-sm font-medium`; current page `bg-primary text-primary-foreground border-primary aria-current="page"`; prev/next use chevron icons with `aria-label`; disabled `aria-disabled opacity-50 pointer-events-none`. Window: first, last, current ±1, ellipsis. Mobile: centered pages, range text below.

### 8.17 Breadcrumb (`ui/breadcrumb.tsx`, add)
`nav aria-label="Breadcrumb"`, `text-sm text-muted-foreground`, separator `ChevronRight size-3.5`, last item `aria-current="page"` not a link. Used on catalog, submission detail ("Submissions › #a1b2c3") and profile.

### 8.18 Header / nav (`components/site-header.tsx`, change)
- `header.sticky top-0 z-40 bg-header text-header-foreground`, then a 3px rule `bg-[linear-gradient(90deg,var(--gold)_0_64px,var(--primary)_64px)]` (dark: gold segment only, 2px, plus `border-b border-border`). Remove `backdrop-blur` and translucency.
- Row `h-16` (problem page `h-13`), container per §6.4.
- Brand: logo mark plus the serif wordmark `text-[1.3rem] font-semibold`.
- Nav links: `h-10 px-3 rounded-md text-[0.9375rem] font-medium text-header-muted hover:text-header-foreground hover:bg-white/8`. Active: `text-header-foreground shadow-[inset_0_-2px_0_var(--gold)] rounded-none` + `aria-current="page"`. Items: Problems, Submissions (Submissions only for signed-in users).
- Right side: ThemeToggle (`icon` ghost, on-dark variant `hover:bg-white/10`). Guest: "Log in" (ghost on-dark) + "Sign up" (light mode: `bg-white text-blue-800`; dark mode: `bg-primary text-primary-foreground`). Signed in: account menu trigger = Avatar + username + `ChevronDown`.
- Below `md`: nav collapses into a `Menu` icon button that opens a `Sheet` from the right (`ui/sheet.tsx`, add) with nav links, then Log in / Sign up or the account items (avatar + username, Profile, Log out; Submissions only once, in the nav block). The account menu trigger is hidden below `md`, so there is one menu per width. The sheet closes itself when the viewport grows to `md`. The guest "Sign up" button stays in the bar at every width.
- Copy note: the current UI says "Login"/"Register". Change the visible labels to **"Log in" / "Sign up"**. Page routes stay `/login` and `/register`.

### 8.19 Account menu (`components/user-menu.tsx`, change)
Trigger as above. Content (align end, `w-56`): header block `px-2 py-2` with username `font-semibold` and "View profile" muted; separator; items `User` Profile → `/u/[username]`, `History` Submissions → `/submissions`; separator; `LogOut` Log out (shows `LoaderCircle` while pending). Keyboard: Base UI defaults.

### 8.20 Footer (`components/site-footer.tsx`, add)
`bg-surface-sunken border-t py-14`. Grid `md:grid-cols-[2fr_1fr_1fr]` (mobile: 2 cols): brand + one-line description; Practice (Problems, Submissions for users); Account (Log in, Sign up or Profile). A Project column (About, Source) is added once the project has a public URL; no placeholder links. Bottom row `mt-10 pt-5 border-t text-sm text-muted-foreground`: "© 2026 LemmaYard. Problem statements are original." Show it on all pages **except** the problem page (full-height workspace).

### 8.21 Split pane / resizer (`components/problem/workspace.tsx`)
- Use `react-resizable-panels` (shadcn `resizable`; check that the base-nova registry ships it, otherwise install the package directly and style it as below).
- Horizontal group: description 45% (min 30%, max 65%) | handle | right 55%. The right column is a vertical group: editor 58% (min 25%) | handle | console 42% (min 20%, collapsible to its tab bar).
- Handle: an 8px transparent hit area with a centered 2×32px grip `bg-border-strong rounded-full`. Hover and active: the grip becomes `bg-primary` and spans the full length. `role="separator"`, keyboard arrows move 5% (library default), focus outline as usual.
- Persist sizes with `autoSaveId="problem-workspace"` (localStorage).
- Panes are cards (`rounded-lg border bg-card overflow-hidden`) on a `bg-surface-sunken` canvas with `p-2`.

### 8.22 Console (`components/problem/console.tsx`)
Tabs: `FlaskConical` Testcase | `Terminal` Result. Body `p-4 md:px-5 overflow-auto`, `aria-live="polite"` on the result region (announce only the final verdict, not every poll).
- Idle: muted text "Run your code to see results here." plus kbd hints.
- Queued: `Clock` + "Queued…" in `verdict-queued` + skeleton lines. After `QUEUED_TIMEOUT_MS`, a warning Alert: "Judge is unavailable, try again later."
- Running: `LoaderCircle` spinning + "Running…" in `verdict-running`. After `WALL_CAP_MS + 30 s`, a warning Alert "Taking longer than expected" + link "Open submission".
- Result header: verdict name in **serif 22/28 600** in the verdict color, with a 22px icon, then a muted summary on the same baseline: Run → "Passed 3 / 3 samples · 38 ms"; Submit → "12 / 12 tests passed".
- Submit metrics row (Accepted and every other submit verdict): two stat tiles `rounded-md border bg-surface-sunken p-3`: "Runtime 41 ms", "Memory 16.2 MB" (label `text-xs text-muted-foreground`, value `font-semibold tabular-nums`).
- Run cases: a pill row of `Case 1..n` (h-8, rounded-md, bordered; selected `bg-secondary border-blue-300 text-secondary-foreground`). Each pill carries a 14px `CircleCheck`/`CircleX` in the verdict color. The selected case shows `Input` (full width), then `Output` | `Expected` in two columns (stacked below 520px). A wrong `Output` value gets `border-danger/40 bg-danger-bg`.
- Wrong Answer (submit): "Failed on test 7 of 12", then Input / Output / Expected blocks + `Stdout` block if non-empty.
- Runtime / Compile Error: a `pre` with `bg-danger-bg text-[--verdict-runtime|compile] border-danger/30 font-mono text-[13px] whitespace-pre-wrap` showing the error text (≤ 8 KB, scrolls). TLE / MLE: one sentence ("Your code ran longer than 2 s on test 4.") plus passed count. Internal Error: "Something went wrong on our side. This submission doesn't count against you." + "Try again" button.
- Custom input result: header "Output" (sans 600, no color), stdout and return value blocks.
- Truncated values (DTO `truncated: true`) end with a muted "… (truncated)" line.
- Testcase tab: one `Textarea` per problem with mono JSON, label "Input (JSON object by parameter name)", help text showing the param names (`nums: int[], target: int`), live validation error under the field (`text-danger`), and "Use sample 1" ghost buttons to prefill. An invalid JSON object disables Run, and the tooltip says why.

---

## 9. Pages

General: every page has `<title>` in the form "Problems · LemmaYard" and one `h1`. The page head band (`bg-surface-sunken border-b py-8`) holds breadcrumb + h1 + subtitle on catalog, submissions and profile.

### 9.1 Landing `/`
```
┌ masthead (navy, 64) ─ logo  Problems Submissions ─────── ☾  Log in [Sign up] ┐
├─ gold│blue 3px rule ──────────────────────────────────────────────────────────┤
│ HERO  bg-sunken + graph-paper (right half)                                    │
│  ── (gold 48px rule)                                                          │
│  EYEBROW  Coding practice, at your own pace            ┌ Problem card ──┐     │
│  Display: Learn to solve problems,                      │ Two Sum   Easy │     │
│           one step at a time.                           └────────────────┘     │
│  Lead (34rem)                                              ┌ code card ─────┐  │
│                                                            │ solution.py    │  │
│  [Start practicing →] [Browse problems]                    └────────────────┘  │
│                                                          ┌ Accepted ┐          │
│  📖 45 original problems  </> Python 3 & JS  ⛨ Isolated sandbox  (lucide)    │
├───────────────────────────────────────────────────────────────────────────────┤
│ WHY  (2 cols 1fr | 1.25fr)   "A calmer way to practice"  | 01 ─ 02 ─ 03 list  │
├ band ─────────────────────────────────────────────────────────────────────────┤
│ HOW IT WORKS   (1)───(2)───(3)───(4)   Pick · Write · Run samples · Submit    │
├───────────────────────────────────────────────────────────────────────────────┤
│ FEATURED  "Start with these"                         [View all problems →]    │
│  table: # | Title | Topics | Acceptance | Difficulty   (4 rows)               │
├ band ─────────────────────────────────────────────────────────────────────────┤
│ PROGRESS PREVIEW  text + CTA  |  card: 18/45 · 64 · 57%  + 3 difficulty bars  │
├ footer ───────────────────────────────────────────────────────────────────────┤
```
Rules: hero CTA goes to `/problems` for signed-in users ("Continue practicing") and to `/register` for guests ("Start practicing"). The featured list is the 4 lowest-numbered published problems spanning easy, medium and hard (server query). The progress preview card uses the real stats for signed-in users and the static example (marked `aria-hidden`, with the caption "Example profile") for guests. The trust row counts real published problems. Mobile: single column, the illustration becomes three stacked static cards, the steps list goes vertical with dots on the left, and the featured table hides the Topics and Acceptance columns.

### 9.2 Login / Register `/login`, `/register`
```
 bg-surface-sunken full page
        ┌───────────── card max-w-[400px] p-8 ─────────────┐
        │  (logo mark 40px, centered)                       │
        │  H2 serif  "Welcome back" | "Create your account" │
        │  muted     "Log in to keep practicing." |          │
        │            "Free. Track your progress as you go."  │
        │  [Alert danger: Invalid email or password]         │
        │  Email  [_____________]                            │
        │  Username [_________]  help: 3–20 lowercase…       │
        │  Password [_________]  help: At least 8 characters │
        │  [ Log in ] (primary, full width, h-10)            │
        ├ footer bg-sunken: "New here? Sign up" ────────────┤
        └────────────────────────────────────────────────────┘
```
`AuthCard` changes: section `bg-surface-sunken flex-1 py-16`, card `max-w-[400px]`, title `font-heading text-[1.75rem]/9`, `CardContent` gap-4. Field errors are inline (§8.2). 409 errors attach to their field ("This email is already registered."). Pending state: the button shows a spinner with "Logging in…" / "Creating account…".

### 9.3 Problems catalog `/problems`
```
 page head: Home › Problems / H1 "Problems" / "45 problems · Python 3 and JavaScript"
 ┌ main (1fr) ──────────────────────────────────────────┐ ┌ aside 280 (≥lg, signed in) ┐
 │ [🔍 Search by title     ][Difficulty▾][Topic▾][Status▾]│ │ Your progress (3 bars)    │
 │ Filtered by (Easy ×)(Array ×) Clear all               │ │ Topics (tag cloud, counts)│
 │ ┌ STATUS │ # │ TITLE           │ ACCEPTANCE │ DIFFICULTY ┐ └──────────────────────────┘
 │ │  ✓     │ 1 │ Two Sum         │   52.4%    │ Easy      │
 │ │  ◌     │ 2 │ Running Sum…    │   71.0%    │ Easy      │   (zebra, 48px rows)
 │ └─────────────────────────────────────────────────────┘
 │ Showing 1–20 of 45                     [‹][1][2][3][›]
```
- Filters write to the URL (`q`, `difficulty`, `tag`, `status`, reset `page`). Search submits on Enter and on a 300ms debounce. Selects apply immediately. The Status select is hidden for guests (AC-M3-2), and so is the Status column.
- Acceptance shows "—" when there are 0 submits (AC-M3-3), in muted color.
- Columns: Status 56px, # 64px (right-aligned), Title (fluid, truncates with `title`), Acceptance 128px (right), Difficulty 112px.
- Aside (≥1024px): progress for signed-in users; the Topics card links set `?tag=`. Guests see only Topics. Optional; drop the aside if it pushes the M3 query count past 3 (AC-M3-7). The Topics counts need one more query, so it's the first to cut.
- Empty state replaces the table (§8.13).
- Mobile (<768px): the search goes full width and the 3 selects sit in a 3-column row. The table becomes a list card. Each row is one link: `[status icon] 1. Two Sum ........ Easy` / second line `52.4% accepted` (muted). Pagination is centered.
- Loading (`loading.tsx`): page head + filter skeletons + 10 row skeletons.

### 9.4 Problem page `/problems/[slug]`
Desktop (≥768px), full height under the compact header:
```
┌ masthead 52 ─────────────────────────────────────────────────────────────────┐
│┌ Description | Submissions ───────────┐┊┌ [Python 3 ▾] [↺ Reset]  ···  [▷ Run] [⇪ Submit] ┐│
││ 1. Two Sum   (serif 26)               │┊│  1 │ from typing import List                       ││
││ (Easy) (✓ Solved) │ Array  Hash table │┊│  2 │                                               ││
││ prose 72ch …                          │┊│  … │ Monaco (lemmayard-light/dark)                  ││
││ ### Example 1  ┃ Input: … Output: …   │┊├ Saved locally ───────────────────── Ln 9, Col 47 ┤│
││ ### Constraints • `2 <= n <= 10^4`    │┊└─────────────────────── ═══ ─────────────────────┘│
││ ┌ note: Follow-up … ┐                 │┊┌ Testcase | Result ───────────────────────────────┐│
││ (scrolls inside pane)                 │┊│ ✓ Accepted  Passed 3 / 3 samples · 38 ms          ││
│└───────────────────────────────────────┘┊│ [✓ Case 1][✓ Case 2][✓ Case 3]                    ││
│                                         ┊│ Input  [nums = [2,7,11,15] …]                      ││
│                                         ┊│ Output [ [0,1] ]   Expected [ [0,1] ]              ││
└─────────────────────────────────────────┴─────────────────────────────────────────────────────┘
```
- Toolbar (h-12, `border-b px-2 gap-2`): language Select (`h-8 w-auto`, options "Python 3", "JavaScript"), ghost `sm` Reset (opens the confirm dialog), spacer, `secondary sm` **Run** (`Play`), `primary sm` **Submit** (`CloudUpload`). Tooltips carry shortcuts (AC-M5-1). While a job is active, both are disabled and the one clicked shows a spinner plus "Running…" / "Submitting…" (AC-M5-6). Guests see the same buttons. Clicking redirects to `/login?next=/problems/slug` (AC-M5-3).
- Editor status bar (h-7, `text-xs text-muted-foreground border-t`): left "Saved locally" (after a localStorage draft write) or nothing, right "Ln, Col".
- Left tab "Submissions" (M6): compact table Time | Verdict | Language | Runtime | Memory, rows link to `/submissions/[id]`. Guests see "Log in to see your submissions".
- Sample Input/Output blocks from `tests.json` render after the description, using the prose `pre` style, titled "Example N" if the markdown doesn't already include them. (Decide in M3; don't duplicate.)
- Mobile (<768px, AC-M3-6): the header stays, then a sticky tab bar **Description | Code** (`flex-1`, h-11). The Code tab shows the toolbar + editor (`h-[55dvh]`) + console stacked under it. A fixed bottom action bar (`border-t bg-card shadow-md p-2.5 px-4`) holds Run and Submit as `flex-1` default-size buttons (40px). It's visible on both tabs, and pressing Run/Submit on the Description tab switches to Code and scrolls to the console. Description content gets `pb-24` so the bar never covers text.
- 404 for unknown or unpublished slugs uses the global not-found page.

### 9.5 Submissions `/submissions`
Page head: breadcrumb, H1 "Submissions", subtitle "Your submitted solutions, newest first." If `?problem=slug` is set: a filter chip "Two Sum ×".
Compact table (40px rows): **Submitted** (relative time, "3 min ago", with an absolute `title`, `tabular-nums`) | **Problem** (link) | **Language** | **Verdict** (VerdictBadge) | **Runtime** (right, "41 ms" or "—") | **Memory** (right, "16.2 MB" or "—"). Clicking the verdict badge or a "View" link opens the detail page. Pagination as in the catalog. Mobile: list rows `Verdict badge · Problem title` / `Python 3 · 41 ms · 3 min ago`. Empty: "No submissions yet" + "Browse problems". Guests are redirected (existing behavior).

### 9.6 Submission detail `/submissions/[id]`
```
 page head: Submissions › Two Sum · a1b2c3
 ┌ verdict header card ──────────────────────────────────────────────────────┐
 │ ✓ Accepted (serif 28, verdict color)    Two Sum (link) · Python 3          │
 │ Submitted Oct 17, 2026, 14:02           12 / 12 tests passed               │
 │ [Runtime 41 ms] [Memory 16.2 MB]                     [Open problem →]       │
 └────────────────────────────────────────────────────────────────────────────┘
 ┌ Failed case (WA only): Input | Output | Expected | Stdout ┐  (or error pre)
 ┌ Code  ·  read-only Monaco, height = min(content, 70vh)  [Copy] ┐
```
The verdict header card has a 4px left border in the verdict color (`border-l-4 border-l-verdict-x`), the only colored-edge usage in the system. Monaco runs with `readOnly: true, domReadOnly: true, lineNumbers on, minimap off`, and gets a "Copy code" ghost button.

### 9.7 Profile `/u/[username]`
```
 page head: Avatar 64 + H1 username (serif) + "Joined Oct 2026"
 ┌ Solved 18/45 ┐┌ Submissions 64 ┐┌ Acceptance 57% ┐     (stat cards, serif 30 numbers)
 ┌ Progress by difficulty ───────────────────────────────┐┌ Recently solved ─────────────┐
 │ Easy   ███████░░░░  10 / 16                            ││ Two Sum          Easy  Oct 17│
 │ Medium ████░░░░░░░   6 / 17                            ││ Valid Brackets   Easy  Oct 15│
 │ Hard   ██░░░░░░░░░   2 / 12                            ││ … (10 unique, first accepted)│
 └────────────────────────────────────────────────────────┘└──────────────────────────────┘
```
Desktop grid `lg:grid-cols-[1.2fr_1fr] gap-6`, stat cards `grid-cols-3` (mobile: 3 cols, 24px numbers). Progress bars use the difficulty colors and always show "n / total" (AC-M6-4). Recently solved: a list with dividers, title link, difficulty text, date `text-sm text-muted-foreground tabular-nums`. Public page: no code, no links to other users' submissions. Empty: "No solved problems yet" (on your own profile with a "Browse problems" action).

### 9.8 Not found, error, loading
- `not-found.tsx`: container `py-24`, eyebrow "404", H1 serif "We couldn't find that page", body "The problem or page may have moved, or the link is incorrect.", buttons primary "Browse problems" + secondary "Go home". Faint graph-paper motif behind it (same CSS as the hero).
- `error.tsx` (client, per route group): Alert-style card "Something went wrong" + muted error digest + `secondary` "Try again" (`reset()`) + link home. No stack traces.
- `loading.tsx` per route: skeletons as in §8.12, never a full-page spinner.

---

## 10. Monaco themes

Register once, before the first editor mounts (in the `beforeMount` of `@monaco-editor/react`), and switch with `monaco.editor.setTheme(resolvedTheme === "dark" ? "lemmayard-dark" : "lemmayard-light")` from `useTheme().resolvedTheme`. Monarch tokenizers for Python and JS emit `keyword`, `identifier`, `type.identifier`, `string`, `string.escape`, `number`, `comment`, `delimiter`, `operator`, `regexp` and `constant`. There's no semantic "function" token, so `function`-colored calls won't appear in Monaco (the previews show it; accept the difference).

```js
monaco.editor.defineTheme("lemmayard-light", {
  base: "vs", inherit: true,
  rules: [
    { token: "", foreground: "14213D" },
    { token: "comment", foreground: "5B6A82", fontStyle: "italic" },
    { token: "keyword", foreground: "1C46A3", fontStyle: "bold" },
    { token: "string", foreground: "0B6E5C" },
    { token: "string.escape", foreground: "8F5500" },
    { token: "number", foreground: "8F5500" },
    { token: "constant", foreground: "B5410E" },
    { token: "regexp", foreground: "B5410E" },
    { token: "type", foreground: "0E6577" },
    { token: "type.identifier", foreground: "0E6577" },
    { token: "identifier", foreground: "14213D" },
    { token: "delimiter", foreground: "3A4A66" },
    { token: "operator", foreground: "3A4A66" },
    { token: "tag", foreground: "1C46A3" },
    { token: "attribute.name", foreground: "8A2378" },
    { token: "predefined", foreground: "8A2378" }
  ],
  colors: {
    "editor.background": "#FBFCFE",
    "editor.foreground": "#14213D",
    "editorLineNumber.foreground": "#647189",
    "editorLineNumber.activeForeground": "#14213D",
    "editor.lineHighlightBackground": "#F3F7FD",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#2457C5",
    "editor.selectionBackground": "#C8DAF6",
    "editor.inactiveSelectionBackground": "#E4EDFB",
    "editor.selectionHighlightBackground": "#E4EDFB",
    "editor.wordHighlightBackground": "#E4EDFB",
    "editor.findMatchBackground": "#F5D48A",
    "editor.findMatchHighlightBackground": "#FBF1DF",
    "editorBracketMatch.background": "#E4EDFB",
    "editorBracketMatch.border": "#9DBCEE",
    "editorIndentGuide.background1": "#E6ECF4",
    "editorIndentGuide.activeBackground1": "#B7C5D9",
    "editorWhitespace.foreground": "#D9E2EE",
    "editorGutter.background": "#FBFCFE",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#D9E2EE",
    "editorSuggestWidget.background": "#FFFFFF",
    "editorSuggestWidget.border": "#D9E2EE",
    "editorSuggestWidget.selectedBackground": "#EAF1FC",
    "editorHoverWidget.background": "#FFFFFF",
    "editorHoverWidget.border": "#D9E2EE",
    "editorError.foreground": "#C42B3C",
    "editorWarning.foreground": "#975A00",
    "scrollbarSlider.background": "#B7C5D966",
    "scrollbarSlider.hoverBackground": "#8293AE80",
    "scrollbarSlider.activeBackground": "#8293AEAA",
    "focusBorder": "#2457C5"
  }
});

monaco.editor.defineTheme("lemmayard-dark", {
  base: "vs-dark", inherit: true,
  rules: [
    { token: "", foreground: "E7EDF7" },
    { token: "comment", foreground: "8C9AB6", fontStyle: "italic" },
    { token: "keyword", foreground: "8DB4F5", fontStyle: "bold" },
    { token: "string", foreground: "4FCDB0" },
    { token: "string.escape", foreground: "E9B04F" },
    { token: "number", foreground: "E9B04F" },
    { token: "constant", foreground: "F49A6B" },
    { token: "regexp", foreground: "F49A6B" },
    { token: "type", foreground: "6FD3E8" },
    { token: "type.identifier", foreground: "6FD3E8" },
    { token: "identifier", foreground: "E7EDF7" },
    { token: "delimiter", foreground: "C3CEE2" },
    { token: "operator", foreground: "C3CEE2" },
    { token: "tag", foreground: "8DB4F5" },
    { token: "attribute.name", foreground: "E3A2EA" },
    { token: "predefined", foreground: "E3A2EA" }
  ],
  colors: {
    "editor.background": "#0F1A2E",
    "editor.foreground": "#E7EDF7",
    "editorLineNumber.foreground": "#7F8FAD",
    "editorLineNumber.activeForeground": "#E7EDF7",
    "editor.lineHighlightBackground": "#15223A",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#7AA3F2",
    "editor.selectionBackground": "#264272",
    "editor.inactiveSelectionBackground": "#1C2D4E",
    "editor.selectionHighlightBackground": "#1C2D4E",
    "editor.wordHighlightBackground": "#1C2D4E",
    "editor.findMatchBackground": "#6B4E12",
    "editor.findMatchHighlightBackground": "#33270F",
    "editorBracketMatch.background": "#1C2D4E",
    "editorBracketMatch.border": "#5B8DEF",
    "editorIndentGuide.background1": "#1F2D48",
    "editorIndentGuide.activeBackground1": "#3A4E73",
    "editorWhitespace.foreground": "#263755",
    "editorGutter.background": "#0F1A2E",
    "editorWidget.background": "#17243E",
    "editorWidget.border": "#263755",
    "editorSuggestWidget.background": "#17243E",
    "editorSuggestWidget.border": "#263755",
    "editorSuggestWidget.selectedBackground": "#1C2D4E",
    "editorHoverWidget.background": "#17243E",
    "editorHoverWidget.border": "#263755",
    "editorError.foreground": "#EE6D7B",
    "editorWarning.foreground": "#E9B04F",
    "scrollbarSlider.background": "#3A4E7366",
    "scrollbarSlider.hoverBackground": "#5A6E9280",
    "scrollbarSlider.activeBackground": "#5A6E92AA",
    "focusBorder": "#7AA3F2"
  }
});
```
Editor options: `fontFamily: fontMono.style.fontFamily` (the hashed next/font family; a literal "JetBrains Mono" won't match the self-hosted face), `fontSize: 14, lineHeight: 22, fontLigatures: false, minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 12 }, renderLineHighlight: "line", automaticLayout: true, tabSize: 4 (python) / 2 (js), "bracketPairColorization.enabled": false` (rainbow brackets clash with the palette). After `document.fonts.ready`, call `monaco.editor.remeasureFonts()`.

Token contrast vs editor background (computed): every token ≥ 4.8:1 in light (line numbers 4.80, comment 5.34) and ≥ 5.3:1 in dark. Full table in §4.7; `tests/unit/contrast.test.ts` rechecks it.

---

## 11. Tailwind v4 / shadcn mapping

### 11.1 `src/app/globals.css`

The file holds, in order: imports (`tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`), the class-based `dark` variant, `@theme inline` (fonts, every color token as `--color-*`, radii, `--shadow-*` → `--elev-*`, easing, `--animate-*`), the static brand scale (`@theme`, overrides Tailwind's `blue-*`), `:root` and `.dark` token values (hex), base layer (borders, focus outline, ligatures off for code, selection), utilities (`container-page`, `eyebrow`), code-sample colors, keyframes and the motion classes, the graph-paper motif, the masthead rule, `.prose-problem`, and the reduced-motion block.

Notes:
- Overriding Tailwind's `blue-*` palette is deliberate: `bg-blue-600` is the brand blue. Don't use other Tailwind hues (`green-*`, `red-*`) in components; use the semantic, verdict or difficulty tokens.
- Opacity modifiers (`bg-primary/20`) work through `color-mix`.
- One-off pairs from §8 are tokens too: `--avatar-bg/fg`, `--tooltip-bg/fg`, `--destructive-hover`, `--destructive-foreground`.
- Focus: the global `:focus-visible` outline (2px `--ring`, offset 2px). Don't put `outline-none` on an element that relies on `focus-visible:outline-2` (in Tailwind v4 it sets the outline style to none). Inputs and selects use border + soft ring instead. The masthead sets `--ring` to blue-300, because the default ring is only 2.65:1 on the navy.
- `buttonVariants()` returns a merged class string (via `cn`), so it is safe on links: `<Link className={buttonVariants({ variant: "secondary" })}>`.

### 11.2 Shared components (what exists)

| Component | Notes |
|---|---|
| `ui/button` | variants `default`, `secondary` (`outline` alias), `soft`, `ghost`, `destructive`, `link`, `header`, `header-solid` (masthead); sizes `sm`, `default`, `lg`, `icon`, `icon-sm` (hit area extended to 40px); `loading` prop (spinner, `aria-busy`, disabled) |
| `ui/input`, `ui/textarea`, `ui/label`, `ui/field` (`Field`, `FieldHelp`, `FieldError`), `ui/select` | §8.2 |
| `ui/card` | `size="sm"`, `interactive` |
| `ui/badge` | `default`, `secondary`, `outline`, `tag`, `status` (colors from a dictionary) |
| `ui/table` | `density="compact"`, `numeric` cells, `tableLinkClasses()` |
| `ui/tabs`, `ui/dropdown-menu`, `ui/tooltip` (+ `Kbd`), `ui/dialog`, `ui/alert-dialog`, `ui/sheet`, `ui/sonner` (mounted in the root layout), `ui/alert`, `ui/avatar` (initials), `ui/progress` (server component), `ui/skeleton`, `ui/separator`, `ui/breadcrumb`, `ui/resizable` | §8 |
| `page-head`, `empty-state`, `pagination` (links; `hrefFor(page)`), `page-skeleton` | pages |

Loading states: don't add a route-level `loading.tsx` to a page that calls `requireUser()` or `notFound()`; once the loading shell streams, the redirect/404 can no longer set the HTTP status. Use `<Suspense fallback={<PageSkeleton />}>` inside the page after the checks instead.

Folder convention: `src/components/ui/` = shadcn primitives only (generated, then themed; no app logic). `src/components/<domain>/` = app components grouped by domain (`brand`, `judge`, `problems`, `problem`, `submissions`, `profile`). Cross-domain shared pieces (`site-header`, `site-footer`, `page-head`, `empty-state`, `pagination`) sit at `src/components/` root. Color and label maps are TypeScript constants (`judge/verdict.ts`, `problems/difficulty.ts`) that export Tailwind class strings. Never build class names dynamically (`text-verdict-${x}`), because Tailwind can't see them.

---

## 12. Accessibility checklist

- [ ] Every text pair in §4.7 holds; new pairs are added to `tests/unit/contrast.test.ts` and pass before merging.
- [ ] Focus: a visible 2px `--ring` outline with 2px offset on every interactive element, including Monaco (`focusBorder`), resizer handles, table sort buttons and case pills. Never `outline: none` without a replacement.
- [ ] Hit targets: ≥40×40px for buttons, links in nav, pagination, icon buttons and selects. Toolbar 32px buttons get the `after:-inset-1` extension. Mobile tabs are 44px.
- [ ] Color is never the only signal: verdicts, difficulty and problem status always carry a word (visible, or sr-only for status icons) and an icon where listed.
- [ ] Status icons in the catalog have sr-only text ("Solved", "Attempted", "Not started").
- [ ] Console result region: `aria-live="polite"`, announcing only the final state ("Accepted. Passed 3 of 3 samples.").
- [ ] Run and Submit are reachable by Tab from the editor (Monaco traps Tab; document `Ctrl/Cmd+M` or set `tabFocusMode` toggle hint in the editor status bar). Needed for AC-M7-3.
- [ ] Progress bars expose `role="progressbar"` with values and labels.
- [ ] Tooltips are not the only place shortcuts are documented (also in the console idle state).
- [ ] `prefers-reduced-motion` honored (§6.6). The spinner turns into a static icon plus text.
- [ ] Headings: one `h1` per page. Problem title is `h1` on the problem page. Card titles are `h2`/`h3` per context.
- [ ] Forms: `label for`, `aria-describedby` for help/errors, `aria-invalid`, autocomplete attributes (already present).
- [ ] Language: `<html lang="en">` (present). Dark mode `color-scheme: dark` for native controls and scrollbars.
- [ ] axe in both themes (AC-M7-3): run with `.dark` toggled via `page.emulateMedia({ colorScheme: "dark" })` and the default system theme.

## 13. Do / don't

Do:
- Use tokens (`bg-card`, `text-muted-foreground`, `text-verdict-wrong`), never raw hex in components (the Avatar and Tooltip dark exceptions in §8 are the only allowed ones; move them to tokens if they grow).
- Render every verdict, difficulty and status through its one component.
- Put pages in a `PageHead` band + container. Keep the problem page full-bleed.
- Right-align numbers, use `tabular-nums`, use "—" for missing values.
- Write UI copy in sentence case ("Browse problems", not "Browse Problems"). Verdict names keep their canonical Title Case.

Don't:
- No purple/violet gradients, glassmorphism, blur headers, decorative blobs, emoji or 3-column icon-circle feature grids.
- No serif in tables, forms, buttons, badges or the console (only the verdict name).
- Don't use gold for text or status, and don't use the solid primary for decoration.
- Don't add a new hue without adding its pairs to `tests/unit/contrast.test.ts`.
- Don't make whole table rows clickable, and don't hide information in hover-only states.
- No `rounded-2xl`+ on app UI, and no pill-shaped buttons.

## 14. Limits (honest notes)

- Contrast is checked for solid colors only. Tinted states made with Tailwind opacity modifiers (`bg-primary/10`, `ring-danger/20`) are not in the table. Prefer the explicit `*-bg` tokens for anything carrying text.
- The CVD check was a simulation (Machado 2009, CIE76 ΔE), not a user test.
- Monaco's monarch tokens have no function-call token, so `function` colors in static samples won't appear in the editor.
- `next/font` adds `size-adjust` fallbacks, so metrics can differ slightly from the original HTML previews.
