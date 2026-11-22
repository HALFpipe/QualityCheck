// usage: node ci-assert.mjs <resultsDir>
// Reads profile.mjs results named <build>-<nSubjects>.json (builds "base" and "head") and checks
// them against the browser test plan. Exits 1 if any check fails.
// Budgets (ms) can be overridden with environment variables; see BUDGET below.
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

const dir = process.argv[2];
const load = async (name) => JSON.parse(await readFile(path.join(dir, `${name}.json`), "utf8"));
const num = (name, fallback) => Number(process.env[name] ?? fallback);

const BUDGET = {
  paint2000: num("BUDGET_PAINT_2000_MS", 15000),
  paint4000: num("BUDGET_PAINT_4000_MS", 30000),
  tab2000: num("BUDGET_TAB_2000_MS", 5000),
  regressionFactor: num("BUDGET_REGRESSION_FACTOR", 1.5),
  regressionSlack: num("BUDGET_REGRESSION_SLACK_MS", 1000),
};
const allowLayoutChange = process.env.ALLOW_LAYOUT_CHANGE === "1";

const rows = [];
const check = (area, name, ok, detail) => rows.push({ area, name, ok, detail });
const ms = (x) => `${Math.round(x)} ms`;
const maxTab = (r) => Math.max(...r.boxPlotTabs.map((t) => t.ms));
const chartsTime = (r) => r.load.paintedMs + r.boxPlotTabs.reduce((a, t) => a + t.ms, 0);

const [base200, head200, base500, head500, head2000, head4000] = await Promise.all(
  ["base-200", "head-200", "base-500", "head-500", "head-2000", "head-4000"].map(load)
);

// box-plot point positions match the base build
for (const [base, head] of [[base200, head200], [base500, head500]]) {
  const same = base.boxPlotTabs.every((t, i) => t.layout === head.boxPlotTabs[i].layout);
  const detail = head.boxPlotTabs.map((t, i) => `${t.valType} ${base.boxPlotTabs[i].layout}→${t.layout}`).join(", ");
  check("Rendering", `fingerprints match base (${head.nImgs} imgs)`, same || allowLayoutChange,
    same ? "identical" : allowLayoutChange ? `changed, allowed: ${detail}` : detail);
}

// absolute budgets on large reports, and no regression against base
check("Performance", "20k imgs: load to painted", head2000.load.paintedMs <= BUDGET.paint2000,
  `${ms(head2000.load.paintedMs)} (budget ${ms(BUDGET.paint2000)})`);
check("Performance", "20k imgs: slowest box-plot tab", maxTab(head2000) <= BUDGET.tab2000,
  `${ms(maxTab(head2000))} (budget ${ms(BUDGET.tab2000)})`);
check("Performance", "40k imgs: load to painted", head4000.load.paintedMs <= BUDGET.paint4000,
  `${ms(head4000.load.paintedMs)} (budget ${ms(BUDGET.paint4000)})`);
const limit = BUDGET.regressionFactor * chartsTime(base500) + BUDGET.regressionSlack;
check("Performance", "5k imgs: charts time vs base", chartsTime(head500) <= limit,
  `head ${ms(chartsTime(head500))}, base ${ms(chartsTime(base500))} (limit ${ms(limit)})`);

// no layout when the charts view is re-shown or only the height changes
const lc = head2000.layoutCalls;
check("Re-layout", "no layout on hide/show of charts", lc.hideAndShowCharts === 0, `${lc.hideAndShowCharts} calls`);
check("Re-layout", "no layout on height-only resize", lc.heightOnlyResize === 0, `${lc.heightOnlyResize} calls`);
check("Re-layout", "layout on width change", lc.widthResize >= 1, `${lc.widthResize} calls`);

// no page errors beyond those base has
const known = new Set(base200.pageErrors);
for (const r of [head200, head500, head2000, head4000]) {
  const fresh = r.pageErrors.filter((e) => !known.has(e));
  check("Page errors", `${r.nImgs} imgs: no new page errors`, fresh.length === 0,
    fresh.length ? fresh.join("; ") : `${r.pageErrors.length} known`);
}

const failed = rows.filter((r) => !r.ok);
const table = [
  "| Area | Check | Result | Detail |",
  "|---|---|---|---|",
  ...rows.map((r) => `| ${r.area} | ${r.name} | ${r.ok ? "✅" : "❌"} | ${r.detail.replaceAll("|", "\\|")} |`),
].join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Browser checks\n\n${table}\n`);
}
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
