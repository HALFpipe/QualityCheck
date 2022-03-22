import { format, precisionFixed } from "d3-format";

import { Val, keyPath, Rating, ratings, ratingColors } from "../../model";
import { ViewModel } from "../../view-model";

import { Attribute, h, t } from "../render";
import { PointFactory } from "../point";
import { Interval, IntervalSet } from "../interval";

import { percent, px, quantile } from "../utils";

class Point2D {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

export class BoxPlot extends HTMLElement {
  static define(): void {
    customElements.define("qc-box-plot", this);
  }

  vals: Array<Val> = new Array<Val>();

  radius: number;
  min: number;
  max: number;

  points: Array<HTMLElement> = new Array<HTMLElement>();
  container: HTMLElement;

  overflowIndicator: HTMLElement;

  constructor(
    viewModel: ViewModel,
    vals: Array<Val>, // assumed to be sorted by val.number
    radius: number,
    valUnit: string,
    valFormat: string,
    nAxisTicks: number
  ) {
    super();

    if (vals.length === 0) {
      return;
    }

    const factory = new PointFactory(["sub", "task", "ses", "run", "dir"]);
    const scansByKeyPath = viewModel.ratingsViewModel.scansByKeyPath;
    for (const val of vals) {
      const valKeyPath = keyPath(val.sub, val.task, val.ses, val.run, val.dir);

      if (valKeyPath in scansByKeyPath) {
        const point = factory.create(val);
        scansByKeyPath[valKeyPath].listen((rating: Rating) => {
          for (const r of ratings) {
            if (r === rating) {
              point.classList.add(ratingColors[r]);
            } else {
              point.classList.remove(ratingColors[r]);
            }
          }
        });
        this.points.push(point);
        this.vals.push(val);
      }
    }
    const pointsContainer = h("div", [new Attribute("class", "points")], [...this.points]);

    // overflow indicator

    this.overflowIndicator = h("div", [new Attribute("class", "overflow")], []);
    let showOverflowIndicator = false;
    const invisibleIndices: Set<number> = new Set<number>();
    const intersectionObserver = new IntersectionObserver(
      (entries: IntersectionObserverEntry[], observer: IntersectionObserver): void => {
        for (const entry of entries) {
          const index = parseInt((entry.target as HTMLElement).dataset.index);
          if (entry.isIntersecting) {
            invisibleIndices.delete(index);
          } else {
            invisibleIndices.add(index);
          }
        }
        // dom update
        const shouldShowOverflowIndicator = invisibleIndices.size > 0;
        if (shouldShowOverflowIndicator) {
          if (!showOverflowIndicator) {
            showOverflowIndicator = true;
            this.overflowIndicator.classList.add("active");
          }
        } else {
          if (showOverflowIndicator) {
            showOverflowIndicator = false;
            this.overflowIndicator.classList.remove("active");
          }
        }
      },
      { root: this, threshold: 0 }
    );
    for (const point of this.points) {
      intersectionObserver.observe(point);
    }

    //

    this.radius = radius;

    this.min = vals[0].number;
    this.min = Math.floor(this.min * 10) / 10;
    this.max = vals[vals.length - 1].number;
    this.max = Math.ceil(this.max * 10) / 10;

    // axis

    const axisTicks = new Array<HTMLElement>();
    const spacing = (this.max - this.min) / nAxisTicks;
    const precision = precisionFixed(spacing);

    const formatVal = format(`.${precision}${valFormat}`);

    for (let i = 0; i < nAxisTicks + 1; i++) {
      const x = this.min + spacing * i;
      let xstr = formatVal(x).replace("%", "");
      if (i === nAxisTicks) {
        xstr = `${xstr} ${valUnit}`;
      }
      axisTicks.push(
        h(
          "div",
          [new Attribute("class", "tick")],
          [h("span", [new Attribute("class", "label")], [t(xstr)])]
        )
      );
    }

    // actual box plot

    const numbers = this.vals.map((val) => val.number);
    const q1 = ((quantile(numbers, 0.25) - this.min) / (this.max - this.min)) * 100; // scale to percent
    const q2 = ((quantile(numbers, 0.5) - this.min) / (this.max - this.min)) * 100;
    const q3 = ((quantile(numbers, 0.75) - this.min) / (this.max - this.min)) * 100;
    const iqr = q3 - q1;

    const leftWhisker = h("span", [new Attribute("class", "whisker left")], []);
    const leftWhiskerX = q1 - 1.5 * iqr;
    leftWhisker.style.left = percent(leftWhiskerX);
    leftWhisker.style.width = percent(1.5 * iqr);

    const leftBox = h("span", [new Attribute("class", "box left")], []);
    leftBox.style.left = percent(q1);
    leftBox.style.width = percent(q2 - q1);

    const rightBox = h("span", [new Attribute("class", "box right")], []);
    rightBox.style.left = percent(q2);
    rightBox.style.width = percent(q3 - q2);

    const rightWhisker = h("span", [new Attribute("class", "whisker right")], []);
    rightWhisker.style.left = percent(q3);
    rightWhisker.style.width = percent(1.5 * iqr);

    this.container = h(
      "div",
      [new Attribute("class", "container")],
      [
        this.overflowIndicator,
        pointsContainer,
        h(
          "div",
          [new Attribute("class", "box")],
          [leftWhisker, leftBox, rightBox, rightWhisker]
        ),
        h("div", [new Attribute("class", "axis")], [...axisTicks]),
      ]
    );
    this.appendChild(this.container);

    const resizeObserver = new ResizeObserver(
      (entries: Array<ResizeObserverEntry>, observer: ResizeObserver): void => {
        for (const entry of entries) {
          if (entry.target !== this) {
            throw new Error("Call to resizeObserverCallback for wrong element");
          }
          if (entry.contentRect) {
            const width = entry.contentRect.width;
            this.layout(width);
          }
        }
      }
    );
    resizeObserver.observe(this);
  }

  layout(width: number): void {
    this.container.style.width = px(width);

    let stack: Array<Point2D> = new Array<Point2D>();
    const axisWidth = width - 24; // needs to match css
    for (let i = 0; i < this.vals.length; i++) {
      const n = this.vals[i].number;
      const x = ((n - this.min) / (this.max - this.min)) * axisWidth;
      stack = stack.filter((p) => p.x > x - this.radius); // remove elements that have no effect

      // greedily find y
      const ins = new IntervalSet();
      for (const p of stack) {
        const d = x - p.x;
        const a = Math.sqrt(this.radius * this.radius - d * d);
        const interval = new Interval(p.y - a, p.y + a);
        ins.add(interval);
      }
      const y = ins.findXWithNoOverlapClosestTo0(this.radius, false);

      stack.push(new Point2D(x, y));
      this.points[i].style.left = px(x);
      this.points[i].style.bottom = px(y);
    }
  }
}
BoxPlot.define();
