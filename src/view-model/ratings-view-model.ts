import SortedSet from "collections/sorted-set";

import {
  Model,
  Rating,
  ratings,
  ratingIndices,
  RatingProperty,
  Img,
  ImgTypeStr,
  TypedCallback,
  keyPath,
  Location,
  Tagged,
} from "../model";

export type IndexSets = {
  [key in Rating]: SortedSet<number>;
};

class IndexSetsImpl implements IndexSets {
  none = new SortedSet<number>();
  good = new SortedSet<number>();
  uncertain = new SortedSet<number>();
  bad = new SortedSet<number>();
}

export class Scan implements Tagged {
  index: number;
  img: Img;
  href: string;

  sub: string;
  task?: string;
  ses?: string;
  run?: string;
  dir?: string;

  private ratings: { [key in ImgTypeStr]: Rating } = {
    skull_strip_report: "none",
    t1_norm_rpt: "none",
    tsnr_rpt: "none",
    bold_conf: "none",
    ica_aroma: "none",
    epi_norm_rpt: "none",
  };

  private callbacks: Array<TypedCallback<Rating>> = new Array<TypedCallback<Rating>>();

  constructor(index: number, img: Img) {
    this.index = index;
    this.img = img;

    this.sub = img.sub;
    this.task = img.task;
    this.ses = img.ses;
    this.run = img.run;
    this.dir = img.dir;

    this.href = Location.makeDynamicHref(this, "explore");
  }

  get rating(): Rating {
    let ragg: Rating = "none";
    for (const r of Object.values<Rating>(this.ratings)) {
      if (ratingIndices[ragg] < ratingIndices[r]) {
        ragg = r;
      }
    }
    return ragg;
  }

  createCallback(key: ImgTypeStr): (r: Rating) => void {
    return (r: Rating): void => {
      const r0 = this.rating;
      this.ratings[key] = r;
      const r1 = this.rating;
      if (r1 !== r0) {
        for (const cb of this.callbacks) {
          cb(r1);
        }
      }
    };
  }

  listen(cb: TypedCallback<Rating>): void {
    this.callbacks.unshift(cb);
    cb(this.rating);
  }
}

// export type RatingsViewModelCallback = (scan: number, : number) => void;

export class RatingsViewModel {
  scanArray: Array<Scan> = new Array<Scan>();
  scansByKeyPath: { [key: string]: Scan } = {};
  scanIndicesByRating: IndexSets = new IndexSetsImpl();

  imgsArraysByType: { [key in ImgTypeStr]: Array<Img> } = {
    skull_strip_report: new Array<Img>(),
    t1_norm_rpt: new Array<Img>(),
    tsnr_rpt: new Array<Img>(),
    bold_conf: new Array<Img>(),
    ica_aroma: new Array<Img>(),
    epi_norm_rpt: new Array<Img>(),
  };
  imgIndicesByTypeByRating: { [key in ImgTypeStr]: IndexSets } = {
    skull_strip_report: new IndexSetsImpl(),
    t1_norm_rpt: new IndexSetsImpl(),
    tsnr_rpt: new IndexSetsImpl(),
    bold_conf: new IndexSetsImpl(),
    ica_aroma: new IndexSetsImpl(),
    epi_norm_rpt: new IndexSetsImpl(),
  };

  private model: Model;

  constructor(model: Model) {
    this.model = model;

    let sub: string = "";
    let anatImgs: Array<Img>;

    let scanKeyPath: string = "";
    let scan: Scan;
    let imgRatingProperty: RatingProperty;
    for (const img of this.model.imgsArray.values()) {
      if (!this.model.ratingPropertiesByHash.has(img.hash)) {
        throw new Error(`RatingProperty not found for img '${img.hash}'`);
      }
      imgRatingProperty = this.model.ratingPropertiesByHash.get(img.hash);
      // separately by imgType
      const index = this.imgsArraysByType[img.type].length;
      this.imgsArraysByType[img.type].push(img);
      this.imgIndicesByTypeByRating[img.type]["none"].push(index);
      imgRatingProperty.listen((rating: Rating): void => {
        for (const r of ratings) {
          if (r === rating) {
            this.imgIndicesByTypeByRating[img.type][r].push(index);
          } else {
            this.imgIndicesByTypeByRating[img.type][r].delete(index);
          }
        }
      });
      // aggregated
      if (sub !== img.sub) {
        sub = img.sub;
        anatImgs = new Array<Img>();
      }
      if (img.suffix === "anat") {
        anatImgs.push(img);
        continue;
      }
      const imgKeyPath = keyPath(img.sub, img.task, img.ses, img.run, img.dir);
      if (scanKeyPath !== imgKeyPath) {
        // start new scan
        scanKeyPath = imgKeyPath;
        const index = this.scanArray.length;
        scan = new Scan(index, img);
        this.scanArray.push(scan);
        this.scansByKeyPath[scanKeyPath] = scan;
        this.scanIndicesByRating["none"].push(index);
        scan.listen((rating: Rating): void => {
          for (const r of ratings) {
            if (r === rating) {
              this.scanIndicesByRating[r].push(index);
            } else {
              this.scanIndicesByRating[r].delete(index);
            }
          }
        });
        for (const anatImg of anatImgs) {
          const anatRatingProperty = this.model.ratingPropertiesByHash.get(anatImg.hash);
          anatRatingProperty.listen(scan.createCallback(anatImg.type).bind(scan));
        }
      }
      if (scan !== null) {
        imgRatingProperty.listen(scan.createCallback(img.type).bind(scan));
      }
    }
  }

  set(hash: string, rating: Rating): void {
    if (!this.model.ratingPropertiesByHash.has(hash)) {
      throw new Error(`Unknown hash '${hash}'`);
    }
    this.model.ratingPropertiesByHash.get(hash).set(rating);
  }
  listen(hash: string, cb: TypedCallback<Rating>): void {
    if (!this.model.ratingPropertiesByHash.has(hash)) {
      throw new Error(`Unknown hash '${hash}'`);
    }
    this.model.ratingPropertiesByHash.get(hash).listen(cb);
  }
}
