import { ViewModel } from "../../view-model";
import {
  Location,
  statusDisplayNames,
  statusColors,
  ratingDisplayNames,
  ratingColors,
  ValType,
  valTypes,
  valTypeDisplayNames,
  valTypeUnits,
  ImgTypeStr,
  imgTypeStrs,
  imgTypeStrDisplayNames,
  valTypeFormat,
} from "../../model";

import { Attribute, h, t } from "../render";

import { BoxPlot } from "./box-plot";
import { MosaicPlot } from "./mosaic-plot";

type LocationPropertyType<K extends keyof Location> = Location[K] & string;

export class ChartContainer<
  K extends "topChart" | "middleChart" | "bottomChart"
> extends HTMLElement {
  static define(): void {
    customElements.define("qc-chart-container", this);
  }

  readonly propertyName: K;

  keys: Array<LocationPropertyType<K>>;

  lastNonNullValue: LocationPropertyType<K>;
  value: LocationPropertyType<K> | null | undefined = undefined;

  minimize: HTMLAnchorElement;

  nav: { [key in LocationPropertyType<K>]?: HTMLAnchorElement } = {};
  charts: { [key in LocationPropertyType<K>]?: HTMLElement } = {};

  constructor(
    keys: Array<LocationPropertyType<K>>,
    titles: { [key in LocationPropertyType<K>]: string },
    charts: { [key in LocationPropertyType<K>]: HTMLElement },
    propertyName: K
  ) {
    super();

    this.keys = keys;
    this.charts = charts;
    this.propertyName = propertyName;

    this.lastNonNullValue = keys[0]; // default value
    this.value = null;

    this.minimize = h("a", [new Attribute("class", "minimize")], []) as HTMLAnchorElement;
    for (const key of this.keys) {
      this.nav[key] = h(
        "a",
        [new Attribute("class", "tab")],
        [t(titles[key])]
      ) as HTMLAnchorElement;
    }

    this.appendChild(
      h("header", [], [...Object.values<HTMLElement>(this.nav), this.minimize])
    );

    for (const chart of Object.values<HTMLElement>(this.charts)) {
      chart.classList.add("collapse");
      this.appendChild(chart);
    }
  }

  onLocationChange(loc: Location): void {
    // first update appearance
    if (this.value !== loc[this.propertyName]) {
      // value was changed
      if (this.value !== null) {
        // current value not null
        this.charts[this.value].classList.remove("active");
        this.nav[this.value].classList.remove("active");
      } else {
        this.minimize.classList.remove("active");
      }
      this.value = loc[this.propertyName];
      if (this.value !== null) {
        // new value not null
        this.lastNonNullValue = this.value;
        this.charts[this.value].classList.add("active");
        this.nav[this.value].classList.add("active");
        this.classList.add("active");
      } else {
        this.classList.remove("active");
        this.minimize.classList.add("active");
      }
    }
    // then update hrefs
    if (loc.viewType == "charts") {
      // only update href if element is visible
      const hrefloc = loc.clone();
      // tabs
      for (const key of this.keys) {
        hrefloc[this.propertyName] = key;
        this.nav[key].href = hrefloc.toFragmentIdentifier();
      }
      // minimize button
      if (hrefloc[this.propertyName] === null) {
        hrefloc[this.propertyName] = this.lastNonNullValue;
      } else {
        hrefloc[this.propertyName] = null;
      }
      this.minimize.href = hrefloc.toFragmentIdentifier();
    }
  }
}
ChartContainer.define();

export class Charts extends HTMLElement {
  static define(): void {
    customElements.define("qc-charts", this);
  }

  topChart: ChartContainer<"topChart">;
  middleChart: ChartContainer<"middleChart">;
  bottomChart: ChartContainer<"bottomChart">;

  constructor(viewModel: ViewModel) {
    super();

    this.topChart = new ChartContainer(
      ["nipype"],
      { nipype: "Nipype status" },
      {
        nipype: new MosaicPlot(
          ["sub"],
          viewModel.statusViewModel.entriesArray,
          viewModel.statusViewModel.entrySets,
          statusDisplayNames,
          statusColors,
          "subject"
        ),
      },
      "topChart"
    );

    const scanMosaicPlot = new MosaicPlot(
      ["sub", "task", "ses", "run", "dir"],
      viewModel.ratingsViewModel.scanArray,
      viewModel.ratingsViewModel.scanIndicesByRating,
      ratingDisplayNames,
      ratingColors,
      "image"
    );
    let imgTypeStrMosaicPlots = {};
    for (const imgTypeStr of Object.values<ImgTypeStr>(imgTypeStrs)) {
      imgTypeStrMosaicPlots[imgTypeStr] = new MosaicPlot(
        ["sub", "task", "ses", "run", "dir"],
        viewModel.ratingsViewModel.imgsArraysByType[imgTypeStr],
        viewModel.ratingsViewModel.imgIndicesByTypeByRating[imgTypeStr],
        ratingDisplayNames,
        ratingColors,
        "image"
      );
    }
    this.middleChart = new ChartContainer(
      ["exclude", ...Object.values(imgTypeStrs)],
      { exclude: "Summary", ...imgTypeStrDisplayNames },
      { exclude: scanMosaicPlot, ...imgTypeStrMosaicPlots },
      "middleChart"
    );

    let valTypeBoxPlots: { [key in ValType]?: HTMLElement } = {};
    for (const valType of valTypes) {
      valTypeBoxPlots[valType] = new BoxPlot(
        viewModel,
        viewModel.valViewModel.vals[valType],
        5,
        valTypeUnits[valType],
        valTypeFormat[valType],
        10
      );
    }
    this.bottomChart = new ChartContainer(
      [...valTypes],
      { ...valTypeDisplayNames },
      valTypeBoxPlots as { [key in ValType]: HTMLElement },
      "bottomChart"
    );

    this.appendChild(this.topChart);
    this.appendChild(this.middleChart);
    this.appendChild(this.bottomChart);

    // this.locationProperty = this.viewModel.model.locationProperty;
    // this.viewType = this.locationProperty.get().viewType;
    // if (this.viewType == "charts") {
    //   this.appendChild(this.charts);
    // } else if (this.viewType == "imgs") {
    //   this.appendChild(this.imgs);
    // }
    viewModel.model.locationProperty.listen(this.onLocationChange.bind(this));
  }

  onLocationChange(loc: Location): void {
    this.topChart.onLocationChange(loc);
    this.middleChart.onLocationChange(loc);
    this.bottomChart.onLocationChange(loc);
  }
}
Charts.define();
