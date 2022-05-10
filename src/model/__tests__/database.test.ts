import { Database } from "../database";
import { Img } from "../dataclass";

describe("Database", () => {
  const path = "report.svg";

  const img1 = Img.load({sub: "01", desc: "skull_strip_report", hash: "1", path});
  img1.index = 0;

  const img2 = Img.load({sub: "02", desc: "skull_strip_report", hash: "2", path});
  img2.index = 1;

  const imgsArray = [img1, img2];

  const database = new Database();
  database.put(imgsArray);

  it("gets closest image", () => {
    let closestImg = database.closest({"sub": "01", "type": "tsnr_rpt"});
    expect(closestImg.sub).toBe("01");
    expect(closestImg.type).toBe("skull_strip_report");

    closestImg = database.closest({"sub": "03", "type": "tsnr_rpt"});
    expect(closestImg.sub).toBe("01");
    expect(closestImg.type).toBe("skull_strip_report");
  });

  it("finds exact match", () => {
    let [ exactImg ] = database.findAll({sub: "01", type: "skull_strip_report"});
    expect(exactImg.hash).toBe("1");

    let result = database.findAll({sub: "03"});
    expect(result.length).toBe(0);
  });

});
