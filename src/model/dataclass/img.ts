import { Location } from "./location";
import {
  ImgType,
  ImgTypeStr,
  imgTypeSuffixes,
  Suffix,
  relatedImgsImgTypes,
  strImgTypes,
  imgTypeStrs,
} from "../record";
import { keyPath } from "../key-path";
import { Indexed, Tagged } from "../types";

interface Loadable extends Tagged {
  path: string;
  hash: string;
  desc: string;
};

export class Img implements Indexed, Tagged {
  index: number;

  sub: string;
  task?: string;
  ses?: string;
  run?: string;
  dir?: string;
  type: ImgTypeStr;
  typeIndex: ImgType;

  suffix: Suffix;

  path: string;
  hash: string;
  sourceFiles: string[];

  href: string;

  protected constructor(
    sub: string,
    type: ImgTypeStr,
    path: string,
    hash: string,
    sourceFiles: string[]
  ) {
    this.sub = sub;
    this.type = type;
    this.typeIndex = strImgTypes[type];
    this.suffix = imgTypeSuffixes[this.typeIndex];
    this.path = path;
    this.hash = hash;
    this.sourceFiles = sourceFiles;

    const loc = new Location("explore");
    loc.sortKey = "sub";
    loc.hash = hash;
    this.href = loc.toFragmentIdentifier();
  }

  get keyPath(): string {
    return keyPath(this.sub, this.task, this.ses, this.run, this.dir, this.type);
  }

  static relatedImgsMap: Map<string, Array<string>> = new Map();
  get relatedImgs() {
    return Img.relatedImgsMap.get(this.keyPath);
  }

  static load(obj: Loadable): Img | null {
    if (!("sub" in obj)) {
      console.warn("Val obj missing 'sub':", obj);
      return null;
    }
    const sub = obj["sub"];
    const task = obj["task"] || null;
    const ses = obj["ses"] || null;
    const run = obj["run"] || null;
    const dir = obj["dir"] || null;
    if (!("desc" in obj)) {
      console.warn("Img obj missing 'desc':", obj);
      return null;
    }
    const desc = obj["desc"];
    if (!("path" in obj)) {
      console.warn("Img obj missing 'path':", obj);
      return null;
    }
    const path = obj["path"];
    if (!(desc in strImgTypes)) {
      if (!(desc in relatedImgsImgTypes)) {
        console.warn(`Img obj has unknown 'desc' value '${desc}':`, obj);
        return null;
      }
      const type = relatedImgsImgTypes[desc];
      const keyp = keyPath(sub, task, ses, run, dir, imgTypeStrs[type]);
      if (!this.relatedImgsMap.has(keyp)) {
        this.relatedImgsMap.set(keyp, new Array<string>());
      }
      this.relatedImgsMap.get(keyp).push(path);
      return null;
    }
    const type = desc;
    if (!("hash" in obj)) {
      console.warn("Img obj missing 'hash':", obj);
      return null;
    }
    const hash = obj["hash"];
    const sourceFiles = obj["sourcefiles"] || [];
    const img = new Img(sub, type, path, hash, sourceFiles);
    img.task = task;
    img.ses = ses;
    img.run = run;
    img.dir = dir;
    return img;
  }
}
