import { Comparator, PropertyComparator, PropertiesComparator } from "./comparator";
import { Deferred } from "./utils";

import { Val } from "./dataclass/val";
import { Img } from "./dataclass/img";
import { PreprocStatus } from "./dataclass/preproc";
import { NodeError } from "./dataclass/error";

import { ValType } from "./record/val-type";

import { LocationProperty } from "./property/location-property";
import { RatingProperty } from "./property/rating-property";

import { Database } from "./database";

export class Model {
  vals: { [key in ValType]: Array<Val> } = {
    fd_mean: new Array<Val>(),
    fd_perc: new Array<Val>(),
    aroma_noise_frac: new Array<Val>(),
    mean_gm_tsnr: new Array<Val>(),
  };

  imgsByHash: { [key: string]: Img } = {};
  imgsArray: Array<Img> = new Array<Img>();
  database: Database = new Database();

  preprocStatuses: { [key: string]: Array<PreprocStatus> } = {};
  nodeErrors: { [key: string]: Array<NodeError> } = {};

  locationProperty: LocationProperty = new LocationProperty();

  ratingPropertiesByHash: Map<string, RatingProperty> = new Map<string, RatingProperty>();

  protected constructor() {}

  protected async sort() {
    const numc: Comparator<Val> = PropertyComparator<Val>("number");
    for (const key in this.vals) {
      this.vals[key] = this.vals[key].sort(numc);
      for (const [index, val] of this.vals[key].entries()) {
        val.index = index;
      }
    }
    const ic: Comparator<Img> = PropertiesComparator<Img>([
      "sub",
      "suffix",
      "task",
      "ses",
      "run",
      "dir",
      "typeIndex",
    ]);
    this.imgsArray.sort(ic);
    for (const [index, img] of this.imgsArray.entries()) {
      img.index = index;
    }
    this.database.put(this.imgsArray);
  }

  protected addImg(img: Img) {
    this.imgsArray.push(img);
    this.imgsByHash[img.hash] = img;
    this.ratingPropertiesByHash.set(img.hash, new RatingProperty(img.hash));
  }

  static async load(): Promise<Model> {
    const model = new Model();

    const reportDfds: Array<Deferred> = new Array<Deferred>();
    for (let i = 0; i < 4; i++) {
      reportDfds.push(new Deferred());
    }

    window["report"] = async (str: string) => {

      let obj = null;
      try {
        obj = JSON.parse(str);
      } catch (e) {
        // TODO display warning
      }

      if (obj instanceof Array) {
        for (const element of obj) {

          try {
            if ("status" in element) {  // reportpreproc.js
                const preprocStatus = await PreprocStatus.load(element);
                const sub = preprocStatus.sub;

                if (!(sub in model.preprocStatuses)) {
                  model.preprocStatuses[sub] = new Array<PreprocStatus>();
                }
                model.preprocStatuses[sub].push(preprocStatus);

            } else if ("path" in element) {  // reportimgs.js
              const img = Img.load(element);
              if (img !== null) {
                model.addImg(img);
              }

            } else if ("node" in element) {  // reporterror.js
              const nodeError = await NodeError.load(element);
              const sub = nodeError.sub;

              if (!(sub in model.preprocStatuses)) {
                model.nodeErrors[sub] = new Array<NodeError>();
              }
              model.nodeErrors[sub].push(nodeError);

            } else {  // reportvals.js
              for (const val of Val.load(element)) {
                model.vals[val.type].push(val);
              }
            }
          } catch (e) {
            // TODO display warning
          }
        }
      }

      reportDfds.pop().resolve();
    };

    const loadScript = async (src: string): Promise<void> => {
      await new Promise((resolve, reject) => {
        var scriptElement: HTMLScriptElement = document.createElement("script");
        scriptElement.src = src;

        scriptElement.addEventListener("error", (event) => {
          reject(`Failed to load ${src} with error ${JSON.stringify(event)}`);
        });
        scriptElement.addEventListener("load", resolve);

        document.body.appendChild(scriptElement);
      });
    };

    const reportPromises: Array<Promise<any>> = reportDfds.map(d => d.promise);

    await Promise.all([
      loadScript("reporterror.js"),
      loadScript("reportimgs.js"),
      loadScript("reportpreproc.js"),
      loadScript("reportvals.js"),
      ...reportPromises,
    ]);
    await model.sort();
    return model;
  }
}
