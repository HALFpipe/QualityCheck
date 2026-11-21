import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ANAT = ["skull_strip_report", "t1_norm_rpt"];
const FUNC = ["tsnr_rpt", "bold_conf", "ica_aroma", "epi_norm_rpt"];
const TASKS = ["rest", "faces"];

const svg = (label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ccc"/><text x="20" y="150" font-size="24">${label}</text></svg>`;

// seeded PRNG so runs are reproducible
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rand = mulberry32(1);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

export async function writeReport(dir, nSubjects) {
  rand = mulberry32(1);
  await mkdir(path.join(dir, "img"), { recursive: true });
  const imgs = [];
  const vals = [];
  const preproc = [];
  const errors = [];
  const width = String(nSubjects).length;
  for (let n = 1; n <= nSubjects; n++) {
    const sub = String(n).padStart(width, "0");
    for (const desc of ANAT) {
      imgs.push({ sub, desc, hash: `${sub}-${desc}`, path: `img/${desc}.svg` });
    }
    for (const task of TASKS) {
      for (const desc of FUNC) {
        imgs.push({ sub, task, desc, hash: `${sub}-${task}-${desc}`, path: `img/${desc}.svg` });
      }
      vals.push({
        sub,
        task,
        fd_mean: Math.exp(-2.5 + 0.6 * gauss()),
        fd_perc: Math.max(0, 8 + 6 * gauss()),
        aroma_noise_frac: Math.min(1, Math.max(0, 0.4 + 0.12 * gauss())),
        mean_gm_tsnr: 55 + 10 * gauss(),
      });
      preproc.push({ sub, task, status: n % 50 === 0 ? "failed" : "done" });
      if (n % 50 === 0) {
        errors.push({
          node: `nipype.fmriprep_wf.single_subject_${sub}_wf.func_preproc_task_${task}_wf.bold_hmc_wf`,
        });
      }
    }
  }
  const js = (obj) => `report('${JSON.stringify(obj)}');\n`;
  await writeFile(path.join(dir, "reportimgs.js"), js(imgs));
  await writeFile(path.join(dir, "reportvals.js"), js(vals));
  await writeFile(path.join(dir, "reportpreproc.js"), js(preproc));
  await writeFile(path.join(dir, "reporterror.js"), js(errors));
  for (const desc of [...ANAT, ...FUNC]) {
    await writeFile(path.join(dir, "img", `${desc}.svg`), svg(desc));
  }
  return imgs.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = await writeReport(process.argv[2], Number(process.argv[3] || 100));
  console.log(`wrote ${n} images`);
}
