import { Location, Img, SortKey, entities } from "../../model";

import { Item } from "../../view-model";

import { PointFactory } from "../point";
import { Attribute, h, t } from "../render";
import { px } from "../utils";

export const levels = ["left", "right"] as const;
export type Level = typeof levels[number];

export class Navigator extends HTMLElement {
  static define(): void {
    customElements.define("qc-navigator", this);
  }

  itemArray: Array<Item>;
  leafNodesByHash: { [key: string]: Item };

  levelPointsDivs: { [key in Level]: HTMLElement } = {
    left: h("div", [new Attribute("class", "points left")], []),
    right: h("div", [new Attribute("class", "points right")], []),
  };
  levelLines: { [key in Level]?: HTMLCanvasElement } = {
    right: h(
      "canvas",
      [new Attribute("class", "lines right"), new Attribute("width", "32px")],
      []
    ) as HTMLCanvasElement,
  };
  levelItemsByIndex: { [key in Level]: { [key: number]: Item } } = {
    left: {},
    right: {},
  };

  levelVisiblePointIndices: { [key in Level]: Set<number> } = {
    left: new Set<number>(),
    right: new Set<number>(),
  };

  levelScroll: { [key in Level]: number } = {
    left: 0,
    right: 0,
  };
  levelActiveItem: { [key in Level]: Item | null } = {
    left: null,
    right: null,
  };

  currentLevel: Level | null = null;
  currentLevelCounter: number = 0;

  constructor(itemArray: Array<Item>, leafNodesByHash: { [key: string]: Item }) {
    super();

    this.itemArray = itemArray;
    this.leafNodesByHash = leafNodesByHash;

    const factory = new PointFactory([...entities]);

    for (const leftItem of itemArray) {
      const leftPoint = factory.create(leftItem, leftItem.entities);
      leftItem.point = leftPoint;
      this.levelItemsByIndex["left"][leftItem.index] = leftItem;
      this.levelPointsDivs["left"].appendChild(leftPoint);
      for (const rightItem of leftItem.childNodes) {
        const rightPoint = factory.create(rightItem, rightItem.entities);
        rightItem.point = rightPoint;
        this.levelItemsByIndex["right"][rightItem.index] = rightItem;
        this.levelPointsDivs["right"].appendChild(rightPoint);
      }
      (this.levelPointsDivs["right"].lastChild as HTMLElement).classList.add("last");
    }

    this.appendChild(this.levelPointsDivs["left"]);
    this.appendChild(this.levelLines["right"]);
    this.appendChild(this.levelPointsDivs["right"]);

    for (const level of levels) {
      const intersectionObserver = new IntersectionObserver(
        (entries: IntersectionObserverEntry[], observer: IntersectionObserver): void => {
          for (const entry of entries) {
            const index = parseInt((entry.target as HTMLElement).dataset.index);
            if (entry.isIntersecting) {
              this.levelVisiblePointIndices[level].add(index);
            } else {
              this.levelVisiblePointIndices[level].delete(index);
            }
          }
        },
        { root: this, threshold: 0 }
      );
      for (const point of this.levelPointsDivs[level].children) {
        intersectionObserver.observe(point);
      }
    }

    for (const level of levels) {
      this.levelPointsDivs[level].addEventListener("scroll", (event: Event): void => {
        if (this.currentLevel === null) {
          this.currentLevel = level;
          this.currentLevelCounter = 10;
        }
      });
    }

    this.addEventListener("mouseleave", (event: MouseEvent): void => {
      this.scrollToActiveItem();
    });

    const resizeObserver = new ResizeObserver(
      (entries: Array<ResizeObserverEntry>, observer: ResizeObserver): void => {
        for (const entry of entries) {
          if (entry.target !== this) {
            throw new Error("Call to resizeObserverCallback for wrong element");
          }
          if (entry.contentRect) {
            const height = entry.contentRect.height;
            this.levelLines["right"].height = height;
            this.scrollToActiveItem();
          }
        }
      }
    );
    resizeObserver.observe(this);

    window.requestAnimationFrame(this.animationFrame.bind(this));
  }

  private drawLines(): void {
    const level = "right";
    const canvas = this.levelLines[level];
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height); //clear canvas
    for (const index of this.levelVisiblePointIndices[level].values()) {
      const item = this.levelItemsByIndex[level][index];
      const rect = item.point.getBoundingClientRect();
      const y = rect.y + rect.height / 2;
      ctx.beginPath();
      ctx.moveTo(canvas.width, y);
      const rectParent = item.parentNode.point.getBoundingClientRect();
      const active = this.levelActiveItem["left"].index === item.parentNode.index;
      const yParent = rectParent.y + rectParent.height / 2;
      ctx.lineTo(0, yParent);
      ctx.strokeStyle = active ? "#000" : "#808080";
      ctx.lineWidth = 1;
      ctx.lineJoin = ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  private checkScroll(level: Level): void {
    const scrollTop = this.levelPointsDivs[level].scrollTop;
    const scrollCenter = scrollTop + this.offsetHeight / 2;
    if (Math.abs(this.levelScroll[level] - scrollTop) > 2) {
      const visiblePointIndices: Set<number> = this.levelVisiblePointIndices[level];
      for (const index of visiblePointIndices.values()) {
        const item = this.levelItemsByIndex[level][index];
        const top = item.point.offsetTop;
        const height = item.point.offsetHeight;
        if (scrollCenter >= top && scrollCenter <= top + height) {
          const proportion = (scrollCenter - top) / height;
          this.propagatePosition(item, proportion);
          this.levelScroll[level] = scrollTop;
          return;
        }
      }
    }
  }
  private animationFrame(): void {
    if (this.currentLevel !== null) {
      this.checkScroll(this.currentLevel);
      this.currentLevelCounter--;
      if (this.currentLevelCounter <= 0) {
        this.currentLevel = null;
      }
    } else {
      for (const level of levels) {
        this.checkScroll(level);
      }
    }
    this.drawLines();
    window.requestAnimationFrame(this.animationFrame.bind(this));
  }

  private propagatePositionParent(item: Item, proportion: number): void {
    if (item.parentNode === null) {
      return;
    }
    const index = item.parentIndex;
    proportion = (index + proportion) / item.parentNode.childNodes.length;
    this.scrollToPosition(item.parentNode.point, proportion);
    this.propagatePositionParent(item.parentNode, proportion);
  }
  private propagatePositionChild(item: Item, proportion: number): void {
    if (item.childNodes.length === 0) {
      return;
    }
    const childPosition = item.childNodes.length * proportion;
    let index = Math.floor(childPosition);
    if (index >= item.childNodes.length) {
      index = item.childNodes.length - 1;
    }
    const remainder = childPosition - index;
    const childItem = item.childNodes[index];
    if (!childItem) {
      return;
    }
    this.scrollToPosition(childItem.point, remainder);
    this.propagatePositionChild(childItem, remainder);
  }
  private propagatePosition(item: Item, proportion: number): void {
    if (item.childNodes.length > 0) {
      this.propagatePositionChild(item, proportion);
    }

    if (item.parentNode !== null) {
      this.propagatePositionParent(item, proportion);
    }
  }

  private scrollToActiveItem(): void {
    // the ResizeObserver fires on load, before any image has been opened
    if (this.levelActiveItem["right"] === null) {
      return;
    }
    this.scrollToPosition(this.levelActiveItem["right"].point, 0);
    this.propagatePositionParent(this.levelActiveItem["right"], 0);
  }
  private setActiveItem(level: Level, item: Item): void {
    if (this.levelActiveItem[level] !== null) {
      this.levelActiveItem[level].point.classList.remove("active");
    }
    this.levelActiveItem[level] = item;
    this.levelActiveItem[level].point.classList.add("active");
  }

  private scrollToPosition(point: HTMLElement, proportion: number): void {
    const top = point.offsetTop;
    const height = point.offsetHeight;
    const pixels = top + proportion * height;
    const parent: HTMLElement = point.parentNode as HTMLElement;
    const level = parent.classList.contains("left") ? "left" : "right";
    this.levelScroll[level] = pixels - parent.offsetHeight / 2;
    parent.scrollTo(0, this.levelScroll[level]);
  }

  onLocationChange(loc: Location): void {
    if (loc.viewType == "explore" && loc.hash in this.leafNodesByHash) {
      const item = this.leafNodesByHash[loc.hash];
      this.setActiveItem("right", item);
      this.setActiveItem("left", item.parentNode);
      this.scrollToActiveItem();
    }
  }
}
Navigator.define();
