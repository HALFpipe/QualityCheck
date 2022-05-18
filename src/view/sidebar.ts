import {
  Location,
  ViewType,
  viewTypes,
  viewTypeDisplayNames,
  SortKey,
  sortKeys,
  sortKeyDisplayNames,
  entities,
} from "../model";
import { ViewModel } from "../view-model";

import { Attribute, h, t } from "./render";

export class Sidebar extends HTMLElement {
  static define(): void {
    customElements.define("qc-sidebar", this);
  }

  viewModel: ViewModel;

  viewType: ViewType | null = null;
  sortKey: SortKey | null = null;

  sortKeyButtonGroup: HTMLElement;
  sortKeyButton: { [key in SortKey]: HTMLElement };

  viewTypeButtonGroup: HTMLElement;
  viewTypeButton: { [key in ViewType]: HTMLElement };

  constructor(viewModel: ViewModel) {
    super();

    this.viewModel = viewModel;

    const importButton = h(
      "a",
      [new Attribute("class", "dropdown-item")],
      [t("Import")]
    );
    const fileInput = h(
      "input",
      [
        new Attribute("type", "file"),
        new Attribute("hidden", ""),
        new Attribute("accept", ".json"),
      ],
      []
    );

    const exportButton = h(
      "a",
      [
        new Attribute("class", "dropdown-item"),
        new Attribute("target", "_blank"),
        new Attribute("download", "exclude.json"),
      ],
      [t("Export")]
    );

    const viewTypeButton: { [key in ViewType]?: HTMLElement } = {};
    for (const viewType of viewTypes) {
      viewTypeButton[viewType] = h(
        "a",
        [
          new Attribute("class", "radio"),
          new Attribute("href", Location.makeDynamicHref({}, viewType)),
        ],
        [t(viewTypeDisplayNames[viewType])]
      );
    }
    this.viewTypeButton = viewTypeButton as { [key in ViewType]: HTMLElement };
    this.viewTypeButtonGroup = h(
      "span",
      [new Attribute("class", "dropdown-item")],
      [t("Show view"), ...Object.values(this.viewTypeButton)]
    );

    const sortKeyButton: { [key in SortKey]?: HTMLElement } = {};
    for (const sortKey of sortKeys) {
      sortKeyButton[sortKey] = h(
        "a",
        [
          new Attribute("class", "radio"),
          new Attribute("href", Location.makeDynamicHref({}, "explore", sortKey)),
        ],
        [t(sortKeyDisplayNames[sortKey])]
      );
    }
    this.sortKeyButton = sortKeyButton as { [key in SortKey]: HTMLElement };
    this.sortKeyButtonGroup = h(
      "span",
      [new Attribute("class", "dropdown-item")],
      [t("Sort by"), ...Object.values(this.sortKeyButton)]
    );

    const menuButton = h(
      "li",
      [new Attribute("class", "menu-button")],
      [
        h(
          "ul",
          [new Attribute("class", "dropdown-menu")],
          [
            h("li", [], [importButton, fileInput]),
            h("li", [], [exportButton]),
            h("li", [], [this.viewTypeButtonGroup]),
            h("li", [], [this.sortKeyButtonGroup]),
          ]
        ),
      ]
    );

    this.appendChild(h("ul", [], [menuButton]));
    this.appendChild(h("div", [new Attribute("class", "spacer")], []));

    menuButton.addEventListener("click", () => {
      menuButton.classList.toggle("active");
    });

    importButton.addEventListener("click", (e) => {
      e.preventDefault();
      fileInput.click();
    });
    fileInput.addEventListener("change", () => {
      const [ file ] = fileInput.files;
      const reader = new FileReader();

      reader.addEventListener("load", () => {
        const database = viewModel.model.database;

        const objs = JSON.parse(reader.result as string);
        for (const obj of objs) {
          const { rating } = obj;
          delete obj["rating"];

          if (rating === "none") {
            continue;
          }

          const imgs = database.findAll(obj);
          for (const img of imgs) {
            viewModel.ratingsViewModel.set(img.hash, rating);
          }
        }
      });

      reader.readAsText(file);
    });

    exportButton.addEventListener("click", () => {
      const objs = new Array();
      for (const [hash, ratingProperty] of viewModel.model.ratingPropertiesByHash) {
        const img = viewModel.model.imgsByHash[hash];
        const obj = {};
        for (const k of entities) {
          if (k === "suffix") {
            // remove computed
            continue;
          }
          if (img[k]) {
            obj[k] = img[k];
          }
        }
        obj["rating"] = ratingProperty.get();
        objs.push(obj);
      }
      const json = JSON.stringify(objs, null, 2);
      exportButton.setAttribute("href", "data:attachment/text," + encodeURI(json));
    });
  }

  onLocationChange(loc: Location): void {
    if (loc.viewType !== this.viewType) {
      if (this.viewType === "zoom") {
        this.classList.remove("hide");
      } else if (this.viewType === "explore") {
      } else if (this.viewType === "charts") {
        this.sortKeyButtonGroup.classList.remove("hide");
      }
      if (this.viewType !== null) {
        this.viewTypeButton[this.viewType].classList.remove("active");
      }
      this.viewType = loc.viewType;
      if (this.viewType === "zoom") {
        this.classList.add("hide");
      } else if (this.viewType === "explore") {
      } else if (this.viewType === "charts") {
        this.sortKeyButtonGroup.classList.add("hide");
      }
      this.viewTypeButton[this.viewType].classList.add("active");
    }
    if (loc.sortKey !== this.sortKey) {
      if (this.sortKey !== null) {
        this.sortKeyButton[this.sortKey].classList.remove("active");
      }
      this.sortKey = loc.sortKey;
      if (this.sortKey !== null) {
        this.sortKeyButton[this.sortKey].classList.add("active");
      }
    }
  }
}
Sidebar.define();
