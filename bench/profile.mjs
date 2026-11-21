// usage: node profile.mjs <index.html> <nSubjects> <workdir> [--cpu]
// Generates a synthetic report (10 images per subject) next to a copy of index.html,
// loads it from file:// in headless Chrome over CDP, and prints timings as JSON.
// --cpu also writes .cpuprofile files (open in Chrome DevTools > Performance) to workdir.
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { writeReport } from "./make-report.mjs";

const [indexHtml, nSubjectsStr, workdir] = process.argv.slice(2);
const wantCpu = process.argv.includes("--cpu");
const nSubjects = Number(nSubjectsStr);

const reportDir = path.join(workdir, `report-${nSubjects}-${path.basename(path.dirname(indexHtml))}`);
const nImgs = await writeReport(reportDir, nSubjects);
await copyFile(indexHtml, path.join(reportDir, "index.html"));

const userDataDir = await mkdtemp(path.join(workdir, "chrome-"));
const chrome = spawn(
  process.env.CHROME_BIN || "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--window-size=1440,900",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    ...(process.env.CI ? ["--no-sandbox"] : []),
    "about:blank",
  ],
  { stdio: "ignore" }
);

let port;
for (let i = 0; i < 100 && !port; i++) {
  try {
    port = (await readFile(path.join(userDataDir, "DevToolsActivePort"), "utf8")).split("\n")[0];
  } catch {
    await sleep(100);
  }
}
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let nextId = 1;
const pending = new Map();
const pageErrors = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === "Runtime.exceptionThrown") {
    pageErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    pageErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  } else if (msg.method === "Inspector.targetCrashed") {
    pageErrors.push("renderer crashed");
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
const evaluate = async (expression) => {
  const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

await s("Page.enable");
await s("Runtime.enable");
await s("Performance.enable");
await s("Profiler.enable");
await s("Profiler.setSamplingInterval", { interval: 200 });
await s("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__qc = {};
    new MutationObserver((muts, obs) => {
      if (document.querySelector("qc-app")) {
        window.__qc.mounted = performance.now();
        requestAnimationFrame(() => setTimeout(() => { window.__qc.painted = performance.now(); }, 0));
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
    window.__qc.longTasks = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__qc.longTasks.push(e.duration); })
      .observe({ type: "longtask", buffered: true });
  `,
});

const profiles = {};
const startCpu = async () => wantCpu && s("Profiler.start");
const stopCpu = async (name) => {
  if (wantCpu) profiles[name] = (await s("Profiler.stop")).profile;
};

const metrics = async () => {
  const { metrics } = await s("Performance.getMetrics");
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
};

// two frames, so ResizeObserver/IntersectionObserver work triggered by the action is included
const nextFrame = `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))))`;
const timeAction = (action) =>
  evaluate(`(async () => { const t0 = performance.now(); ${action}; await ${nextFrame}; return performance.now() - t0; })()`);

const result = { nSubjects, nImgs, build: path.basename(path.dirname(indexHtml)) };

await startCpu();
await s("Page.navigate", { url: `file://${reportDir}/index.html` });
const loadStart = Date.now();
let painted = false;
const fatal = () => pageErrors.some((e) => /Maximum call stack|renderer crashed/.test(e));
for (let i = 0; i < 6000 && !painted && !fatal(); i++) {
  painted = await evaluate("window.__qc && window.__qc.painted").catch(() => false);
  if (!painted) await sleep(50);
}
if (!painted) {
  console.error(`app did not render after ${Date.now() - loadStart} ms`);
  for (const e of pageErrors) console.error(`  page error: ${e}`);
  chrome.kill();
  await rm(userDataDir, { recursive: true, force: true });
  process.exit(1);
}
await stopCpu("load");
const qc = await evaluate("({...window.__qc, nav: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd})");
const m = await metrics();
result.load = {
  mountedMs: qc.mounted,
  paintedMs: qc.painted,
  longestTaskMs: Math.max(0, ...qc.longTasks),
  domNodes: m.Nodes,
  jsHeapMB: m.JSHeapUsedSize / 2 ** 20,
  layoutCount: m.LayoutCount,
  layoutMs: m.LayoutDuration * 1000,
  scriptMs: m.ScriptDuration * 1000,
};
result.initialView = await evaluate("location.hash");
// fingerprint of every box-plot point position, to check that layout changes render identically
const boxPlotLayout = () =>
  evaluate(`[...document.querySelectorAll("qc-box-plot")].map((plot) => {
    let h = 2166136261;
    for (const p of plot.points) {
      for (const ch of p.style.left + "," + p.style.bottom + ";") {
        h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
      }
    }
    return { width: plot.offsetWidth, points: plot.points.length, fnv1a: h.toString(16) };
  })`);
result.boxPlotLayout = await boxPlotLayout();

// show each box-plot tab in turn; record switch time and the layout of whichever plot is visible
result.boxPlotTabs = [];
for (const valType of ["fd_perc", "aroma_noise_frac", "mean_gm_tsnr", "fd_mean"]) {
  const ms = await timeAction(`location.hash = "#/charts/nipype+exclude+${valType}"`);
  const visible = (await boxPlotLayout()).find((p) => p.width > 0);
  result.boxPlotTabs.push({ valType, ms, layout: visible && visible.fnv1a });
}
await timeAction(`location.hash = "#/charts/nipype+exclude+fd_mean"`);

// count BoxPlot.layout calls: hiding and re-showing the charts view, or a height-only resize,
// should not lay out again; a width change should
const settle = `new Promise(r => setTimeout(r, 500)).then(() => ${nextFrame})`;
await evaluate(`(() => {
  const proto = customElements.get("qc-box-plot").prototype;
  const orig = proto.layout;
  window.__qc.layoutCalls = 0;
  proto.layout = function (...a) { window.__qc.layoutCalls++; return orig.apply(this, a); };
})()`);
const layoutCallsAfter = async (action) => {
  await evaluate(`window.__qc.layoutCalls = 0`);
  await action();
  await evaluate(settle);
  return evaluate(`window.__qc.layoutCalls`);
};
const firstImgHash = await evaluate("document.querySelector('qc-app').viewModel.model.imgsArray[0].hash");
const setViewport = (width, height) =>
  s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
await setViewport(1440, 900);
await evaluate(settle);
result.layoutCalls = {
  hideAndShowCharts: await layoutCallsAfter(async () => {
    await evaluate(`location.hash = "#/explore/by-sub/${firstImgHash}"`);
    await evaluate(settle);
    await evaluate(`location.hash = "#/charts/nipype+exclude+fd_mean"`);
  }),
  heightOnlyResize: await layoutCallsAfter(() => setViewport(1440, 700)),
  widthResize: await layoutCallsAfter(() => setViewport(1200, 700)),
};
await s("Emulation.clearDeviceMetricsOverride");
await evaluate(settle);

await startCpu();
const firstHash = await evaluate("document.querySelector('qc-app').viewModel.model.imgsArray[0].hash");
const midHash = await evaluate(
  "(() => { const a = document.querySelector('qc-app').viewModel.model.imgsArray; return a[Math.floor(a.length/2)].hash; })()"
);
result.switchToExploreMs = await timeAction(`location.hash = "#/explore/by-sub/${firstHash}"`);
result.navigateFarMs = await timeAction(`location.hash = "#/explore/by-sub/${midHash}"`);

const keyTimes = [];
for (let i = 0; i < 10; i++) {
  keyTimes.push(await timeAction(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }))`));
}
result.nextImageMs = { median: median(keyTimes), max: Math.max(...keyTimes) };

const rateTimes = [];
for (const key of ["w", "x", "s", "w", "x"]) {
  rateTimes.push(await timeAction(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "${key}" }))`));
}
result.rateMs = { median: median(rateTimes), max: Math.max(...rateTimes) };

result.scroll = await evaluate(`(async () => {
  const nav = document.querySelector("qc-explorer").firstElementChild;
  const list = [...nav.children].find(c => c.scrollHeight > c.clientHeight + 10);
  if (!list) return null;
  list.scrollTop = 0;
  await ${nextFrame};
  const deltas = [];
  let last = performance.now();
  for (let i = 0; i < 120; i++) {
    list.scrollTop += 60;
    await new Promise(r => requestAnimationFrame(r));
    const now = performance.now();
    deltas.push(now - last);
    last = now;
  }
  deltas.sort((a, b) => a - b);
  return {
    frames: deltas.length,
    p50: deltas[Math.floor(deltas.length * 0.5)],
    p95: deltas[Math.floor(deltas.length * 0.95)],
    max: deltas[deltas.length - 1],
  };
})()`);

result.switchToChartsMs = await timeAction(`location.hash = "#/charts"`);
result.switchToZoomMs = await timeAction(`location.hash = "#/zoom/by-sub/${midHash}"`);
await stopCpu("interact");

const localStorageReads = await evaluate(`(() => {
  let n = 0;
  const orig = Storage.prototype.getItem;
  Storage.prototype.getItem = function (...a) { n++; return orig.apply(this, a); };
  const t0 = performance.now();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
  const dt = performance.now() - t0;
  Storage.prototype.getItem = orig;
  return { getItemCallsPerRating: n, syncMs: dt };
})()`);
result.rateStorage = localStorageReads;

if (wantCpu) {
  for (const [name, profile] of Object.entries(profiles)) {
    await writeFile(path.join(workdir, `${result.build}-${nSubjects}-${name}.cpuprofile`), JSON.stringify(profile));
    result[`cpu_${name}`] = summarize(profile);
  }
}

result.pageErrors = [...new Set(pageErrors.map((e) => e.split("\n")[0]))];
console.log(JSON.stringify(result, null, 2));
await send("Browser.close").catch(() => {});
chrome.kill();
await rm(userDataDir, { recursive: true, force: true });
process.exit(0);

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function summarize(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    dt.set(id, (dt.get(id) || 0) + (profile.timeDeltas[i] || 0) / 1000);
  }
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const label = (n) => {
    const f = n.callFrame;
    return `${f.functionName || "(anon)"}${f.lineNumber >= 0 ? `:${f.lineNumber + 1}` : ""}`;
  };
  const self = new Map();
  const total = new Map();
  for (const [id, ms] of dt) {
    const n = byId.get(id);
    self.set(label(n), (self.get(label(n)) || 0) + ms);
    const seen = new Set();
    let cur = id;
    while (cur !== undefined) {
      const l = label(byId.get(cur));
      if (!seen.has(l)) {
        total.set(l, (total.get(l) || 0) + ms);
        seen.add(l);
      }
      cur = parent.get(cur);
    }
  }
  const top = (m, k) =>
    [...m.entries()]
      .filter(([l]) => !["(root)", "(program)", "(idle)"].includes(l))
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([l, ms]) => `${ms.toFixed(1).padStart(8)} ms  ${l}`);
  return { self: top(self, 25), inclusive: top(total, 40) };
}
