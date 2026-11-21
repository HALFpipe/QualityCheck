// usage: node check-ratings.mjs <index.html> <nSubjects> <workdir>
// Rates a few images, then checks that every mosaic block on the charts view shows exactly its
// set's points in index order, with a matching count label. Exits 1 on any mismatch.
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { writeReport } from "./make-report.mjs";

const [indexHtml, nSubjectsStr, workdir] = process.argv.slice(2);
const reportDir = path.join(workdir, `check-${nSubjectsStr}-${path.basename(path.dirname(indexHtml))}`);
await writeReport(reportDir, Number(nSubjectsStr));
await copyFile(indexHtml, path.join(reportDir, "index.html"));

const userDataDir = await mkdtemp(path.join(workdir, "chrome-"));
const chrome = spawn(
  process.env.CHROME_BIN || "google-chrome",
  ["--headless=new", "--disable-gpu", "--window-size=1440,900", "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`, ...(process.env.CI ? ["--no-sandbox"] : []), "about:blank"],
  { stdio: "ignore" }
);
let port;
while (!port) {
  try {
    port = (await readFile(path.join(userDataDir, "DevToolsActivePort"), "utf8")).split("\n")[0];
  } catch {
    await sleep(100);
  }
}
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((r) => {
    pending.set(++nextId, r);
    ws.send(JSON.stringify({ id: nextId, method, params, sessionId }));
  });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const frames = `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))))`;

await send("Page.navigate", { url: `file://${reportDir}/index.html` }, sessionId);
let mounted = false;
for (let i = 0; i < 1200 && !mounted; i++) {
  mounted = await evaluate(`!!document.querySelector("qc-app")`).catch(() => false);
  if (!mounted) await sleep(100);
}
if (!mounted) {
  console.error("app did not render");
  process.exit(1);
}

// rate images spread across the report, including re-rating the same image
const result = await evaluate(`(async () => {
  const app = document.querySelector("qc-app");
  const imgs = app.viewModel.model.imgsArray;
  const plan = [[0, "x"], [Math.floor(imgs.length / 2), "w"], [imgs.length - 1, "s"], [1, "x"], [0, "w"], [3, "x"], [3, "x"]];
  for (const [i, key] of plan) {
    location.hash = "#/explore/by-sub/" + imgs[i].hash;
    await ${frames};
    document.dispatchEvent(new KeyboardEvent("keydown", { key }));
    await ${frames};
  }
  location.hash = "#/charts/nipype+exclude+fd_mean";
  await ${frames};

  const problems = [];
  let blocksChecked = 0;
  for (const plot of document.querySelectorAll("qc-mosaic-plot")) {
    Object.values(plot.sets).forEach((set, b) => {
      const block = plot.blocks[b];
      const shown = [...block.querySelector(".container").children];
      const expected = set.map((i) => plot.points[i]);
      if (shown.length !== expected.length || shown.some((el, k) => el !== expected[k])) {
        problems.push("block " + b + " of a " + plot.objs.length + "-object plot: DOM order differs from set");
      }
      if (new Set(set.map((i) => i)).size !== set.length) {
        problems.push("block " + b + ": set contains duplicate indices");
      }
      const label = block.querySelector(".info").textContent;
      if (!label.startsWith(set.length + " ")) {
        problems.push("block " + b + ": label '" + label + "' but set has " + set.length);
      }
      blocksChecked++;
    });
  }
  const ratings = {};
  for (const [hash, p] of app.viewModel.model.ratingPropertiesByHash) {
    const r = p.get();
    if (r !== "none") ratings[hash] = r;
  }
  return { blocksChecked, problems, ratings };
})()`);

console.log(JSON.stringify(result, null, 2));
chrome.kill();
await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
process.exit(result.problems.length ? 1 : 0);
