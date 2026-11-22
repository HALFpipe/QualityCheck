# Testing QualityCheck

This guide covers how to test changes to QualityCheck: unit tests, synthetic and real reports, a
manual checklist, and the automated browser checks that run in CI.

QualityCheck builds to a single file, `dist/index.html`. HALFpipe copies it into each report
directory, and users open it straight from disk (`file://`). The page loads its data through
`<script src="report*.js">` tags, not `fetch`. Most bugs that matter only show up when the built
page runs against a report, so unit tests alone aren't enough.

New here? Do [Setup](#1-setup), then follow the [walkthrough](#2-walkthrough-testing-a-change).
The rest of the guide is reference.

## Contents

1. [Setup](#1-setup)
2. [Walkthrough: testing a change](#2-walkthrough-testing-a-change)
3. [Unit tests](#3-unit-tests)
4. [Test reports](#4-test-reports)
5. [Manual checklist](#5-manual-checklist)
6. [Automated browser checks](#6-automated-browser-checks)
7. [CI](#7-ci)
8. [Comparing against another build](#8-comparing-against-another-build)
9. [Known issues](#9-known-issues)

## 1. Setup

You need Google Chrome and the Node version pinned in `.mise.toml` (currently the Node 26 LTS
line). CI uses the same pin. With [mise](https://mise.jdx.dev):

```sh
mise trust && mise install
mise run build
```

`.mise.toml` also defines tasks for the routine steps in this guide. `mise tasks` lists them:

| Task | Does |
|---|---|
| `mise run install` | Installs npm dependencies. Skips if `package-lock.json` hasn't changed. |
| `mise run build` | Builds `dist/index.html`. Skips if nothing it depends on has changed. |
| `mise run test` | Runs the unit tests. |
| `mise run report [subjects]` | Generates a synthetic report with the current build (section 4.1). |
| `mise run example <piop1\|piop2>` | Downloads a public example report and adds the current build (section 4.2). |
| `mise run open <dir>` | Opens a report in Chrome with a fresh profile (section 4.4). |
| `mise run bench:compare [base] [out]` | Runs the CI browser checks against a base ref (section 8). |

Tasks that need a build run `install` and `build` first. CI uses the same tasks.

Without mise, any Node 22 or newer should work. The browser scripts need Node's built-in `fetch`
and `WebSocket`. Only the pinned version is tested. The plain commands are:

```sh
npm ci
npm run build
```

The output goes to `dist/index.html`.

If Chrome isn't on your `PATH` as `google-chrome`, set `CHROME_BIN`, for example
`CHROME_BIN=chromium-browser`.

## 2. Walkthrough: testing a change

This walks through one full pass over a change: unit tests, a synthetic report, a real report,
and the same comparison CI runs. Each step says what you should see. For smaller changes, the
table at the end ([Which steps to run](#which-steps-to-run)) says which steps you can skip.

The timings below come from a Linux desktop with a gigabit connection. Yours will differ, but
anything many times slower is worth investigating.

### 2.1 Before you start

Finish [Setup](#1-setup). Leave about 7 GB of disk free: step 2.5 downloads a 2.2 GB zip that
unzips to 4.3 GB, and the zip is deleted once it has been unzipped.

### 2.2 Run the unit tests

```sh
mise run test
```

This takes a few seconds, and every test should pass. If one fails, fix it before going further.
The browser steps assume the logic underneath is sound.

The coverage report at the end will contain red lines. Those aren't failures, just test coverage gaps.

### 2.3 Open a small synthetic report

```sh
mise run report 200
mise run open reports/synthetic-200
```

`report` builds if anything changed, writes a 200-subject report (2,000 images), and prints its
directory. `open` starts Chrome with a fresh, temporary profile, so no ratings from earlier
sessions carry over. Closing that Chrome window throws the profile away.

You should see the charts view within a second, with four box-plot tabs and the mosaic blocks.
Every 50th subject is marked as a failed preprocessing run, so a few points show up as failed.
The images in explore and zoom are placeholders: grey boxes labelled with the image type, such as
`tsnr_rpt`. Synthetic reports test structure and scale, not how images look. Step 2.6 uses real
images.

Open DevTools on the Console tab now and leave it open. That's where the page's errors show up.
Chrome also logs its own internal diagnostics. `open` hides those unless Chrome fails to start, but
if you launch Chrome yourself you'll see lines like `Frame latency is negative` in the terminal.
They come from Chrome, not from QualityCheck, so ignore them.

Work through the parts of the [manual checklist](#5-manual-checklist) that your change affects.

### 2.4 Change, rebuild, reload

As you change the code, run the same `report` command again:

```sh
mise run report 200
```

It rebuilds and copies the new `index.html` into the report. The data files come out identical
each time, because the generator uses a fixed seed. Reload the open tab to pick up the new build.
Ratings you made stay in that window's profile until you close it.

### 2.5 Scale up, if your change could affect speed or memory

```sh
mise run report 2000
mise run open reports/synthetic-2000
```

At 2,000 subjects (20,000 images), the charts should appear in about 1.5 s, and switching
box-plot tabs should take well under a second. For large-report robustness, try 4,000 subjects
(40,000 images), which should load in about 3 s. If a size takes much longer or the tab freezes,
profile it with `profile.mjs --cpu` (section 6.1).

### 2.6 Check against a real report

```sh
mise run example piop2
mise run open reports/ds-piop2
```

The first run downloads and unzips the report. That took about 70 s on gigabit. Later runs skip
the download and just copy in your current build, so re-run the command after every rebuild, as in
step 2.4.

piop2 loads in well under a second. It exercises things synthetic data never does:

- Subjects are uneven. Some lack one of the two tasks, and some have only anatomical images.
- The task names (`workingmemory`, `emomatching`) and real QC images differ from the synthetic
  ones.
- There are extra value columns (`dummy_scans`, `scan_start`, `sdc_method`,
  `fallback_registration`) that have no box plot.
- The report contains 4,864 images of 13 types. The app shows the 2,212 that belong to the six
  types it knows and ignores the rest.

Go through the checklist items your change touches again. The console should stay empty. If an
error appears, check section 9 for errors that already happen on `main`. Anything not listed
there is new.

### 2.7 Compare against `main`

```sh
mise run bench:compare
```

This is the comparison CI runs on every pull request. It builds `main` in a temporary worktree,
profiles both builds in headless Chrome, checks ratings on a 40,000-image report, and prints a
results table. It takes about two minutes, and every row should show ✅.

If a row shows ❌, the Area column tells you where to look:

| Area | What it means | What to do |
|---|---|---|
| Rendering | Box-plot points are in different places than on `main`. | If you meant to move them, label the pull request `layout-change` (section 7). Otherwise, find what moved them. |
| Performance | A load or tab switch went over its budget, or is much slower than `main`. | Run it once more to rule out noise. Then compare the JSON in `.bench/results`, and profile with `--cpu`. |
| Re-layout | The charts re-run layout when they're re-shown or when only the window height changes. | Look for a new trigger of `BoxPlot.layout` (section 6.1, `layoutCalls`). |
| Page errors | A console error that `main` doesn't have. | The Detail column shows the message. |

### 2.8 Clean up

```sh
rm -rf reports/synthetic-* .bench
```

Synthetic reports take seconds to regenerate. Keep `reports/ds-piop2` while you're working, so you
don't download it again, and delete it (4.3 GB) when you're done.

### Which steps to run

| Your change touches | Steps |
|---|---|
| Docs, CI, or tooling only | 2.2, plus a build |
| Model or data logic | 2.2, 2.3, 2.6 |
| Charts, layout, or rendering | All of them |
| Explore, navigation, or ratings | 2.2, 2.3, 2.6, with the ratings checklist |
| Anything, before opening a pull request | 2.7. CI runs it anyway, and running it locally is faster. |

## 3. Unit tests

```sh
mise run test        # or: npm test
```

This runs Jest over every `__tests__/` directory, plus any `*.spec.ts` or `*.test.ts` file under
`src/`. Coverage goes to `coverage/`.

Unit tests suit pure logic: data classes, interval and set structures, sorting and matching. When
you fix a bug in that kind of code, add a test that fails without the fix. For anything involving
the DOM, layout, or how the page loads, use the browser checks in section 6.

## 4. Test reports

All reports go under `reports/`, which is gitignored. To put them somewhere else, set
`QC_REPORTS`.

### 4.1 Synthetic reports

`mise run report <subjects>` runs `bench/make-report.mjs` and copies in the current build. Without
mise:

```sh
node bench/make-report.mjs reports/synthetic-200 200
cp dist/index.html reports/synthetic-200/
```

The generator writes the four `report*.js` files HALFpipe produces, plus placeholder SVG images.
Each subject gets 10 images: 2 anatomical, plus 4 functional for each of two tasks (`rest` and
`faces`). Each subject also gets four QC values per task (`fd_mean`, `fd_perc`,
`aroma_noise_frac`, `mean_gm_tsnr`) on rough bell curves. Every 50th subject is marked as a failed
preprocessing run with a node error. A fixed random seed makes the output the same every time.

| Subjects | Images | Good for |
|---|---|---|
| 20–200 | 200–2,000 | Everyday checks, and comparing two builds by eye |
| 2,000 | 20,000 | Performance work on charts and layout |
| 4,000+ | 40,000+ | Large-report robustness (recursion depth, memory) |

Synthetic data is very regular. It has no missing images, no sessions or runs, and the same task
names and value columns every time. It also doesn't spread its data across lines in the
`report*.js` files the way real reports do. Use it to test scale and to check that two builds
behave the same. Don't treat it as proof that real reports work.

### 4.2 Example reports

`mise run example <name>` downloads one of the public example reports, also linked from the
README:

| Name | Download | Zip | Unzipped | Contents |
|---|---|---|---|---|
| `piop2` | <https://download.fmri.science/reports/ds-piop2.zip> | 2.2 GB | 4.3 GB | 226 subjects, 2 tasks, 4,864 images (2,212 shown) |
| `piop1` | <https://download.fmri.science/reports/ds-piop1.zip> | 4.0 GB | — | — |

The task downloads the zip into `reports/`, unzips it to `reports/ds-<name>/`, and deletes the
zip. If a download is interrupted, running the task again resumes it. Once the report is
unzipped, later runs skip the download and copy in your current `dist/index.html`, replacing
whatever version the zip came with. Start with piop2, since it's the smaller of the two.

### 4.3 Your own data

If you test with a report from your own study, treat it as participant data. Keep it outside the
repository (point `QC_REPORTS` elsewhere, or copy `dist/index.html` in by hand), and never commit
it or attach it to an issue or pull request.

### 4.4 Ratings carry over between reports

The app saves each rating in `localStorage`, keyed by the image hash alone. Chrome shares one
`localStorage` across all `file://` pages. Every synthetic report uses the same hashes
(`0001-skull_strip_report` and so on), so ratings made in one synthetic report show up in every
other one. Real reports use content hashes, so they only collide with copies of the same report.

To test ratings from a clean state, open the report in a fresh profile:

```sh
mise run open reports/synthetic-200
# or: google-chrome --user-data-dir="$(mktemp -d)" "file://$PWD/reports/synthetic-200/index.html"
```

Or clear storage between tests (DevTools → Application → Local storage → `file://` → Clear). The
automated scripts already use a fresh profile for every run.

## 5. Manual checklist

Run through the parts that apply to your change. Keep DevTools open on the Console tab, because a
new error there counts as a failure even if the page looks right. Section 9 lists errors that
already happen.

### Loading

- [ ] The page renders from `file://` inside a report directory, and no `.error` element appears.
- [ ] A large report (4,000 synthetic subjects) renders.

### Charts view (`#/charts`)

- [ ] Every box-plot tab shows its points, box, whiskers and axis.
- [ ] Switching tabs is quick and doesn't freeze the page.
- [ ] Resizing the window reflows the plots to the new width.
- [ ] Mosaic blocks show counts that match the number of points in each block.

### Explore view (`#/explore/by-sub/<hash>` or `#/explore/by-type/<hash>`)

- [ ] `a`/`←` and `d`/`→` move to the previous and next image.
- [ ] The navigator list scrolls smoothly.
- [ ] The zoom view opens, and `q`/`Esc` goes back to explore.

### Ratings

Use a fresh profile (see 4.4).

- [ ] `w` (good), `s` (uncertain) and `x` (bad) set the current image's rating, and the point's
      color changes on the charts view.
- [ ] After a rating change, the image's point moves to the right mosaic block, in index order
      among that block's points. The counts on the old and new blocks both update.
- [ ] Giving an image the rating it already has changes nothing.
- [ ] Ratings are still there after reloading the page.

### When you change chart layout or rendering

Compare your build with `main` on the same report (section 8). Point positions should match
exactly unless the change is meant to move them.

## 6. Automated browser checks

The scripts in `bench/` run the built page in headless Chrome over the Chrome DevTools Protocol.
They need no extra dependencies. Each run makes its own report directory and a temporary Chrome
profile.

### 6.1 `profile.mjs`: timings and checks for one build

```sh
node bench/profile.mjs dist/index.html 2000 /tmp/qc-work > result.json
node bench/profile.mjs dist/index.html 2000 /tmp/qc-work --cpu > result.json   # with CPU profiles
```

The script generates a report, loads it, and works through the app the way a user would. It
exits 1 if the page never renders. Its JSON output includes:

| Field | Meaning |
|---|---|
| `load.paintedMs` | Time from navigation to the first paint after the app mounts |
| `load.longestTaskMs` | Longest main-thread task during load |
| `boxPlotTabs[]` | Switch time for each box-plot tab, plus a `layout` fingerprint of point positions |
| `layoutCalls` | `BoxPlot.layout` calls after hiding and re-showing charts, after a height-only resize, and after a width resize |
| `nextImageMs`, `rateMs` | Median and max time for keyboard navigation and rating |
| `scroll` | Frame times while scrolling the navigator |
| `pageErrors` | Uncaught exceptions and `console.error` output |

With `--cpu`, the script also writes `.cpuprofile` files to the work directory. Open them in
Chrome DevTools → Performance, and the JSON gets a summary of the functions that took the most
time.

### 6.2 `run.sh`: a size sweep

```sh
bench/run.sh dist/index.html /tmp/qc-work 100 500 1000 2000
```

This runs `profile.mjs` at each size and prints one table row per size. It's useful for seeing
how a cost grows with report size.

### 6.3 `check-ratings.mjs`: rating correctness

```sh
node bench/check-ratings.mjs dist/index.html 4000 /tmp/qc-work
```

The script rates images across the report, including changing one image's rating and repeating
another. It then checks every mosaic block: the points shown must be exactly that block's set, in
index order, with no duplicates and a matching count label. It exits 1 if anything is wrong.

### 6.4 `ci-assert.mjs`: pass/fail against a base build

```sh
node bench/ci-assert.mjs <resultsDir>
```

The script reads `profile.mjs` results named `<build>-<subjects>.json`: base at 200 and 500
subjects, and head at 200, 500, 2000 and 4000. It groups its checks by area:

| Area | Checks |
|---|---|
| Rendering | Box-plot fingerprints match the base build at 200 and 500 subjects. |
| Performance | Load and tab-switch times stay within budget at 2,000 and 4,000 subjects. At 500 subjects, head is no slower than 1.5× base plus 1 s. |
| Re-layout | The charts view doesn't lay out again when it's re-shown or when only the window height changes, and does lay out when the width changes. |
| Page errors | Head has no page errors that base doesn't also have. |

It prints a table of results with these area names, and writes the table to the job summary when
it runs in GitHub Actions.

## 7. CI

`.github/workflows/continuous_integration.yml` builds the app, runs the unit tests, and uploads
coverage.

`.github/workflows/browser-tests.yml` runs on pull requests to `main`, on pushes to `main`, and on
demand. It runs the unit tests, then `mise run bench:compare` against the pull request's base,
and uploads the results as the `browser-results` artifact. `bench:compare` (`bench/compare.sh`):

1. builds the base ref in a temporary worktree (`.ci-base/`)
2. runs `profile.mjs` for base at 200 and 500 subjects, and for head at 200, 500, 2,000 and 4,000
3. runs `check-ratings.mjs` on head at 4,000 subjects
4. runs `ci-assert.mjs`

All three workflows install Node from `.mise.toml` and build with the mise tasks.

### Budgets

The time limits are set well above what a developer machine needs, to absorb noise on shared CI
runners. You can override them with environment variables:

| Variable | Default |
|---|---|
| `BUDGET_PAINT_2000_MS` | 15000 |
| `BUDGET_PAINT_4000_MS` | 30000 |
| `BUDGET_TAB_2000_MS` | 5000 |
| `BUDGET_REGRESSION_FACTOR` | 1.5 |
| `BUDGET_REGRESSION_SLACK_MS` | 1000 |

If a Performance check fails, look at the uploaded results before raising the limit. The comparison
against base catches most slowdowns. The absolute budgets catch costs that grow badly with report
size.

### Intended rendering changes

If a pull request is meant to move points on the box plots, the Rendering check will fail. Add
the `layout-change` label to the pull request to allow it. Say in the description what changed and
why.

## 8. Comparing against another build

To run the same checks as CI, comparing your working tree against `main` or any other ref:

```sh
mise run bench:compare               # against main, results in .bench/results
mise run bench:compare 0.4.1 /tmp/qc
```

This takes about two minutes. It prints the results table at the end and exits 1 if any check
fails. The JSON for each run stays in `<out>/results` for a closer look. `.bench/` is gitignored.
Without mise, build first and run `bench/compare.sh [base] [out]`.

For a manual comparison, generate the same report twice, copy in a different build each time,
and open the two side by side in windows of the same size.

## 9. Known issues

These problems already exist. Don't count them as regressions, but don't add to them either.

- `Cannot read properties of undefined (reading 'split')` shows up in the automated runs, during
  the interactions `profile.mjs` scripts. Its cause hasn't been tracked down. CI ignores it by
  comparing against the base build.
- `src/model/model.ts`: the `nodeErrors` branch checks `model.preprocStatuses` where it should
  check `model.nodeErrors`.
- If any of the four `report*.js` files is missing, `Model.load()` rejects and the app never
  renders.
- Ratings are stored under the image hash alone, so reports with the same hashes share ratings in
  one browser. That affects every synthetic report, and copies of the same real report (see 4.4).
