import { Val } from "../val";

describe("Val", () => {
  it.each([
    [
      {
        sub: "24",
        task: "rest",
        aroma_noise_frac: ["mean_std", 0.65, 0.07, 2, 0],
      },
      0,
    ],
    [
      {
        sub: "24",
        task: "rest",
        aroma_noise_frac: 0.65,
        fd_perc: 100.0,
      },
      2,
    ],
  ])("parse %s", (obj, expected_count: number) => {
    const vals = Array.from(Val.load(obj));
    expect(vals.length == expected_count).toEqual(true);
  });
});
