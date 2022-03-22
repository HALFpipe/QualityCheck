export const imgTypes = [
  0, // skull_strip_report
  1, // t1_norm_rpt
  2, // tsnr_rpt
  3, // bold_conf
  4, // aroma
  5, // epi_norm_rpt
] as const;
export type ImgType = typeof imgTypes[number];

export const suffixes = ["anat", "func"] as const;
export type Suffix = typeof suffixes[number];

const a = "skull_strip_report";
const b = "t1_norm_rpt";
const c = "tsnr_rpt";
const d = "bold_conf";
const e = "ica_aroma";
const f = "epi_norm_rpt";

export const strImgTypes: { [key: string]: ImgType } = {
  [a]: 0,
  [b]: 1,
  [c]: 2,
  [d]: 3,
  [e]: 4,
  [f]: 5,
} as const;

export const imgTypeStrs: { [key in ImgType]: string } = {
  0: a,
  1: b,
  2: c,
  3: d,
  4: e,
  5: f,
} as const;

export type ImgTypeStr = typeof imgTypeStrs[ImgType];
export function isImgTypeStr(s: string): s is ImgTypeStr {
  return s in strImgTypes;
}

export const imgTypeDisplayNames: { [key in ImgType]: string } = {
  0: "T1w skull-stripping",
  1: "T1w spatial normalization",
  2: "EPI tSNR",
  3: "EPI Confounds",
  4: "EPI ICA-based artifact removal",
  5: "EPI spatial normalization",
} as const;

export const imgTypeStrDisplayNames: { [key in ImgTypeStr]: string } = {
  [a]: imgTypeDisplayNames[0],
  [b]: imgTypeDisplayNames[1],
  [c]: imgTypeDisplayNames[2],
  [d]: imgTypeDisplayNames[3],
  [e]: imgTypeDisplayNames[4],
  [f]: imgTypeDisplayNames[5],
} as const;

export const imgTypeSuffixes: { [key in ImgType]: Suffix } = {
  0: "anat",
  1: "anat",
  2: "func",
  3: "func",
  4: "func",
  5: "func",
} as const;

export const relatedImgsImgTypes: { [key in string]: ImgType } = {
  t1w_dseg_mask: 1,
  std_t1w: 1,
  compcor: 3,
  conf_corr: 3,
  reg: 5,
  bold_rois: 5,
  sdc: 5,
} as const;

export const suffixDisplayNames: { [key in Suffix]: string | null } = {
  anat: "T1w",
  func: null,
} as const;
