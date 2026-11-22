# Testing QualityCheck

This guide covers how to test changes to QualityCheck: unit tests, synthetic and real reports, a
manual checklist, and the automated browser checks that run in CI.

QualityCheck builds to a single file, `dist/index.html`. HALFpipe copies it into each report
directory, and users open it straight from disk (`file://`). The page loads its data through
`<script src="report*.js">` tags, not `fetch`. Most bugs that matter only show up when the built
page runs against a report, so unit tests alone aren't enough.

## Contents

1. [Setup](#1-setup)
2. [Unit tests](#2-unit-tests)
3. [Test reports](#3-test-reports)
4. [Manual checklist](#4-manual-checklist)
5. [Automated browser checks](#5-automated-browser-checks)
6. [CI](#6-ci)
7. [Comparing against another build](#7-comparing-against-another-build)
8. [Known issues](#8-known-issues)

## 1. Setup

You need Google Chrome and the Node version pinned in `.mise.toml` (currently the Node 26 LTS
line). CI uses the same pin. With [mise](https://mise.jdx.dev):

```sh
mise trust && mise install
```

Without mise, any Node 22 or newer should work. The browser scripts need Node's built-in `fetch`
and `WebSocket`. Only the pinned version is tested.

```sh
npm ci --ignore-scripts
npm install --no-save --ignore-scripts sass@1.108.2
npm run build
```

A plain `npm ci` fails on current Node, because `node-sass` 7 won't compile. `--ignore-scripts`
skips that build. With Dart Sass (`sass`) installed alongside it, `sass-loader` uses Dart Sass in
place of `node-sass`. The output goes to `dist/index.html`.

If Chrome isn't on your `PATH` as `google-chrome`, set `CHROME_BIN`, for example
`CHROME_BIN=chromium-browser`.

## 2. Unit tests

```sh
npm test
```

This runs Jest over every `__tests__/` directory, plus any `*.spec.ts` or `*.test.ts` file under
`src/`. Coverage goes to `coverage/`.

Unit tests suit pure logic: data classes, interval and set structures, sorting and matching. When
you fix a bug in that kind of code, add a test that fails without the fix. For anything involving
the DOM, layout, or how the page loads, use the browser checks in section 5.

## 3. Test reports

### 3.1 Synthetic reports

`bench/make-report.mjs` writes a report in HALFpipe's format. The page can load it with the four
`report*.js` files and the placeholder images.

```sh
node bench/make-report.mjs ~/qc-reports/demo 200    # 200 subjects
cp dist/index.html ~/qc-reports/demo/
google-chrome "file://$HOME/qc-reports/demo/index.html"
```

Each subject gets 10 images: 2 anatomical, plus 4 functional for each of two tasks (`rest` and
`faces`). Each subject also gets four QC values per task (`fd_mean`, `fd_perc`, `aroma_noise_frac`,
`mean_gm_tsnr`) on rough bell curves. Every 50th subject is marked as a failed preprocessing run
with a node error. A fixed random seed makes the output the same every time.

Rough sizes:

| Subjects | Images | Good for |
|---|---|---|
| 20–200 | 200–2,000 | Everyday checks, and comparing two builds by eye |
| 2,000 | 20,000 | Performance work on charts and layout |
| 4,000+ | 40,000+ | Large-report robustness (recursion depth, memory) |

Synthetic data is very regular. It has no missing images, no sessions or runs, and the same task
names and value columns every time. Use it to test scale and to check that two builds behave the
same. Don't treat it as proof that real reports work.

### 3.2 Real reports

Public example reports are linked from the README:

- <https://download.fmri.science/reports/ds-piop1.zip>
- <https://download.fmri.science/reports/ds-piop2.zip>

Unzip one, copy in your `dist/index.html`, and open it. Use these to test anything a user would
see.

If you test with a report from your own study, treat it as participant data. Keep it outside the
repository, and never commit it or attach it to an issue or pull request.

### 3.3 Ratings carry over between reports

The app saves each rating in `localStorage`, keyed by the image hash alone. Chrome shares one
`localStorage` across all `file://` pages. Every synthetic report uses the same hashes
(`0001-skull_strip_report` and so on), so ratings made in one synthetic report show up in every
other one. To test ratings from a clean state, open the report in a fresh profile:

```sh
google-chrome --user-data-dir="$(mktemp -d)" "file://$HOME/qc-reports/demo/index.html"
```

Or clear storage between tests (DevTools → Application → Local storage → `file://` → Clear). The
automated scripts already use a fresh profile for every run.

## 4. Manual checklist

Run through the parts that apply to your change. Keep DevTools open on the Console tab, because a
new error there counts as a failure even if the page looks right. Section 8 lists errors that
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

Use a fresh profile (see 3.3).

- [ ] `w` (good), `s` (uncertain) and `x` (bad) set the current image's rating, and the point's
      color changes on the charts view.
- [ ] After a rating change, the image's point moves to the right mosaic block, in index order
      among that block's points. The counts on the old and new blocks both update.
- [ ] Giving an image the rating it already has changes nothing.
- [ ] Ratings are still there after reloading the page.

### When you change chart layout or rendering

Compare your build with `main` on the same report (section 7). Point positions should match
exactly unless the change is meant to move them.

## 5. Automated browser checks

The scripts in `bench/` run the built page in headless Chrome over the Chrome DevTools Protocol.
They need no extra dependencies. Each run makes its own report directory and a temporary Chrome
profile.

### 5.1 `profile.mjs`: timings and checks for one build

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

### 5.2 `run.sh`: a size sweep

```sh
bench/run.sh dist/index.html /tmp/qc-work 100 500 1000 2000
```

This runs `profile.mjs` at each size and prints one table row per size. It's useful for seeing
how a cost grows with report size.

### 5.3 `check-ratings.mjs`: rating correctness

```sh
node bench/check-ratings.mjs dist/index.html 4000 /tmp/qc-work
```

The script rates images across the report, including changing one image's rating and repeating
another. It then checks every mosaic block: the points shown must be exactly that block's set, in
index order, with no duplicates and a matching count label. It exits 1 if anything is wrong.

### 5.4 `ci-assert.mjs`: pass/fail against a base build

```sh
node bench/ci-assert.mjs <resultsDir>
```

The script reads `profile.mjs` results named `base-<n>.json` and `head-<n>.json` for sizes 200,
500, 2000 and 4000. It checks that:

- box-plot fingerprints match the base build at 200 and 500 subjects
- load and tab-switch times stay within budget at 2,000 and 4,000 subjects
- at 500 subjects, head is no slower than 1.5× base plus 1 s
- the charts view doesn't lay out again when re-shown or when only the height changes, and does
  lay out when the width changes
- head has no page errors that base doesn't also have

It prints a table of results, and writes it to the job summary when it runs in GitHub Actions.

## 6. CI

`.github/workflows/continuous_integration.yml` builds the app, runs `npm test`, and uploads
coverage.

`.github/workflows/browser-tests.yml` runs on pull requests to `main`, on pushes to `main`, and on
demand. It:

1. builds the pull request (head) and its base branch
2. runs the unit tests
3. runs `profile.mjs` for base at 200 and 500 subjects, and for head at 200, 500, 2,000 and 4,000
4. runs `check-ratings.mjs` on head at 4,000 subjects
5. runs `ci-assert.mjs` and uploads the results as the `browser-results` artifact

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

If a budget check fails, look at the uploaded results before raising the limit. The comparison
against base catches most slowdowns. The absolute budgets catch costs that grow badly with report
size.

### Intended rendering changes

If a pull request is meant to move points on the box plots, the fingerprint check will fail. Add
the `layout-change` label to the pull request to allow it. Say in the description what changed and
why.

## 7. Comparing against another build

To compare your branch with `main`, build each one into its own directory. The directory name
becomes the build's label in the results.

```sh
git worktree add ../qc-main main
(cd ../qc-main && npm ci --ignore-scripts && npm install --no-save --ignore-scripts sass@1.108.2 && npm run build)
mkdir -p /tmp/qc/builds/base /tmp/qc/builds/head
cp ../qc-main/dist/index.html /tmp/qc/builds/base/
cp dist/index.html /tmp/qc/builds/head/

for spec in base:200 head:200 base:500 head:500 head:2000 head:4000; do
  b=${spec%%:*} n=${spec##*:}
  node bench/profile.mjs /tmp/qc/builds/$b/index.html $n /tmp/qc/work > /tmp/qc/$b-$n.json
done
node bench/ci-assert.mjs /tmp/qc

git worktree remove ../qc-main
```

For a manual comparison, generate the same report twice, copy in a different build each time,
and open the two side by side in windows of the same size.

## 8. Known issues

These problems already exist. Don't count them as regressions, but don't add to them either.

- Two console errors appear during normal use: `Cannot read properties of null (reading 'point')`
  and `Cannot read properties of undefined (reading 'split')`. CI ignores them by comparing
  against the base build.
- `src/model/model.ts`: the `nodeErrors` branch checks `model.preprocStatuses` where it should
  check `model.nodeErrors`.
- If any of the four `report*.js` files is missing, `Model.load()` rejects and the app never
  renders.
- Ratings are stored under the image hash alone, so reports with the same hashes share ratings in
  one browser (see 3.3).
