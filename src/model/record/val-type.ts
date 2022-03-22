import { ImgType } from "./img-type";

export const valTypes = ["fd_mean", "fd_perc", "aroma_noise_frac", "mean_gm_tsnr"] as const;
export type ValType = typeof valTypes[number];

export function isValType(s: string): s is ValType {
  return ((valTypes as any) as string[]).includes(s);
}

export const valTypeDisplayNames: { [key in ValType]: string } = {
  fd_mean: "Mean framewise displacement",
  fd_perc: "% frames with framewise displacement > threshold",
  aroma_noise_frac: "% ICs classified as noise",
  mean_gm_tsnr: "Mean gray matter tSNR",
} as const;

export const valTypeUnits: { [key in ValType]: string } = {
  fd_mean: "mm",
  fd_perc: "%",
  aroma_noise_frac: "%",
  mean_gm_tsnr: "AU",
} as const;

export const valTypeFormat: { [key in ValType]: string } = {
  fd_mean: "f",
  fd_perc: "f",
  aroma_noise_frac: "%",
  mean_gm_tsnr: "f",
} as const;

export const valTypeImgTypes: { [key in ValType]: ImgType } = {
  fd_mean: 3,
  fd_perc: 3,
  aroma_noise_frac: 4,
  mean_gm_tsnr: 2,
} as const;
