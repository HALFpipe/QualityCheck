import { valTypes, ValType, imgTypeStrs, valTypeImgTypes } from "../record";
import { keyPath } from "../key-path";
import { Tagged, Indexed } from "../types";

export class Val implements Tagged, Indexed {
  index: number;

  sub: string;
  task: string;
  ses?: string;
  run?: string;
  dir?: string;

  type: ValType;
  number: number;

  href: string;

  protected constructor(sub: string, task: string, type: ValType, number: number) {
    this.sub = sub;
    this.task = task;
    this.type = type;
    this.number = number;
  }

  static *load(obj): IterableIterator<Val> {
    if (!("sub" in obj)) {
      return;
    }
    const sub = obj["sub"];

    if (!("task" in obj)) {
      return;
    }
    const task = obj["task"];

    for (const type of valTypes) {
      if (!(type in obj)) {
        continue;
      }
      let number = obj[type];
      if (isNaN(number)) {
        continue;
      }

      const val = new Val(sub, task, type, number);

      if ("ses" in obj) {
        val.ses = obj["ses"];
      }
      if ("run" in obj) {
        val.run = obj["run"];
      }
      if ("dir" in obj) {
        val.dir = obj["dir"];
      }

      yield val;
    }
  }
}
