import FastSet from "collections/fast-set";

import { Img } from "./dataclass/img";

import { Entity, entities } from "./record/entity";
import { Tagged } from "./types";

export class Database {
  // partial re-implementation of pipeline database

  imgsArray: Array<Img>;
  indexSets: { [key in Entity]: { [key: string]: FastSet<number> } } = {
    sub: {},
    suffix: {},
    task: {},
    ses: {},
    run: {},
    dir: {},
    type: {},
  };

  constructor() {}

  put(imgsArray: Array<Img>): void {
    this.imgsArray = imgsArray;

    for (const img of this.imgsArray) {
      for (const key of entities) {
        const value = img[key];

        const valueMap = this.indexSets[key];

        if (!(value in valueMap)) {
          valueMap[value] = new FastSet<number>();
        }

        valueMap[value].add(img.index);
      }
    }
  }

  matches(obj: Tagged, exact: boolean, basedOnEntities?: Entity[]): number[] | null {
    basedOnEntities = basedOnEntities || [...entities];

    let matches: FastSet<number> | null = null;
    for (const key of basedOnEntities) {
      const value = obj[key];

      if (value == null) {  // == catches both `null` and `undefined`
        continue;
      }
      if (!(value in this.indexSets[key])) {  // unknown value
        if (exact) {
          return null;
        } else {
          continue;
        }
      }

      const indexSet = this.indexSets[key][value];

      if (matches == null) {
        matches = indexSet;
      } else {
        const intersectionSet = matches.intersection(indexSet);

        if (intersectionSet.length === 0) {
          if (exact) {
            return null;
          } else {
            break;  // return what we have
          }
        }

        matches = intersectionSet;
      }
    }

    if (matches === null) {
      return null;
    }

    return matches.toArray().sort();
  }

  findAll(obj: Tagged): Img[] {
    const matches = this.matches(obj, true);

    if (matches === null) {
      return Array();
    }

    return matches.map((index) => this.imgsArray[index]);
  }

  closest(obj: Tagged, basedOnEntities?: Entity[]): Img {
    const matches = this.matches(obj, false, basedOnEntities);

    if (matches === null || matches.length < 1) {
      return this.imgsArray[0];  // default if no match
    }

    return this.imgsArray[matches[0]];
  }
}
