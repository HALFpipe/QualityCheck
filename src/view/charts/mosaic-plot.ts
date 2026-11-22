import { format } from "d3-format";

import { pluralize } from "inflected";

import { Entity } from "../../model/record/entity";
import { Collection, Indexed, Hrefable, Tagged } from "../../model/types";
import { SortedIndexSet } from "../../model/sorted-index-set";

import { Attribute, h, t } from "../render";
import { PointFactory } from "../point";

export class MosaicPlot<
  T extends Indexed & Hrefable & Tagged,
  K extends keyof T & string,
  P extends T[K] & string
> extends HTMLElement {
  static define(): void {
    customElements.define("qc-mosaic-plot", this);
  }

  objs: Array<T>;
  sets: { [key in P]: Collection };

  points: Array<HTMLElement>;
  blocks: Array<HTMLElement> = new Array<HTMLElement>();

  constructor(
    entities: Array<keyof T & Entity>,
    objs: Array<T>,
    sets: { [key in P]: Collection }, // disjoint
    displayNames: { [key in P]: string },
    colors: { [key in P]: string },
    noun: string
  ) {
    super();

    this.sets = sets;
    this.objs = objs;

    const factory = new PointFactory(entities);
    this.points = this.objs.map((entry) => factory.create(entry));

    for (const [key, set] of Object.entries<Collection>(sets)) {
      const displayName = displayNames[key];
      const color = colors[key];

      const pointsInSet = set.map((i: number) => this.points[i]);

      const pointsContainer = h("div", [new Attribute("class", "container")], pointsInSet);

      const infoElement = h("span", [new Attribute("class", "info")], []);

      const block = h(
        "div",
        [new Attribute("class", `block ${color}`)],
        [
          h(
            "header",
            [],
            [h("span", [new Attribute("class", `caption`)], [t(displayName)]), infoElement]
          ),
          pointsContainer,
        ]
      );

      const f = format(".0%");
      const layout = (length: number): void => {
        const proportion = length / this.objs.length;
        const percentStr = f(proportion);
        
        let inflected = noun;
        if (length > 1) {
          inflected = pluralize(noun);
        }

        if (percentStr !== "0%") {
          infoElement.textContent = `${length} ${inflected} (${percentStr})`;
        } else {
          infoElement.textContent = `${length} ${inflected}`;
        }
      };
      layout(set.length);
      this.blocks.push(block);

      if (set instanceof SortedIndexSet) {
        set.addRangeChangeListener(
          (plus: Array<number>, minus: Array<number>, at: number): void => {
            for (const i of minus) {
              // do nothing, because block.add call
              // will automatically remove element from old
              // location when moving via insertBefore
            }
            for (const i of plus) {
              if (at < pointsContainer.children.length) {
                pointsContainer.insertBefore(this.points[i], pointsContainer.children[at]);
              } else {
                pointsContainer.appendChild(this.points[i]);
              }
            }
            layout(set.length);
          }
        );
      }
    }

    const container = h("div", [new Attribute("class", "container")], [...this.blocks]);
    this.appendChild(container);
  }
}
MosaicPlot.define();
