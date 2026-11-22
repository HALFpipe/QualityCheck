import { SortedIndexSet } from "./sorted-index-set";

import { Entity } from "./record/entity";

export type Collection = SortedIndexSet | Array<number>;

export interface Indexed {
  index: number;
}

export interface Hrefable {
  href: string;
}

export type Tagged = {
  [key in Entity]?: string;
};
