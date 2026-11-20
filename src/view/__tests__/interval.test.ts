import { Interval, IntervalSet } from "../interval";

// The original one-at-a-time merge, kept as the reference behavior.
function referenceStack(intervals: Array<[number, number]>): Array<[number, number]> {
  let stack: Array<Interval> = [];
  for (const [lo, hi] of intervals) {
    const arr = [...stack, new Interval(lo, hi)];
    arr.sort((a, b) => a.lower - b.lower);
    stack = [arr.shift()];
    for (const j of arr) {
      const top = stack[stack.length - 1];
      if (top.upper < j.lower) {
        stack.push(j);
      } else if (top.upper < j.upper) {
        top.upper = j.upper;
      }
    }
  }
  return stack.map((i) => [i.lower, i.upper]);
}

function randomIntervals(n: number, seed: number): Array<[number, number]> {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const c = rand() * 100;
    const a = rand() * 10;
    out.push([c - a, c + a]);
  }
  return out;
}

const toPairs = (set: IntervalSet) => set.stack.map((i) => [i.lower, i.upper]);

describe("IntervalSet", () => {
  test("addAll matches sequential merging", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const intervals = randomIntervals(1 + (seed % 40), seed);
      const set = new IntervalSet();
      set.addAll(intervals.map(([lo, hi]) => new Interval(lo, hi)));
      expect(toPairs(set)).toEqual(referenceStack(intervals));
    }
  });

  test("add still merges incrementally", () => {
    const intervals = randomIntervals(30, 7);
    const set = new IntervalSet();
    for (const [lo, hi] of intervals) {
      set.add(new Interval(lo, hi));
    }
    expect(toPairs(set)).toEqual(referenceStack(intervals));
  });

  test("touching intervals merge", () => {
    const set = new IntervalSet();
    set.addAll([new Interval(2, 3), new Interval(0, 2)]);
    expect(toPairs(set)).toEqual([[0, 3]]);
  });

  test("empty addAll leaves set empty", () => {
    const set = new IntervalSet();
    set.addAll([]);
    expect(set.stack).toEqual([]);
    expect(set.findXWithNoOverlapClosestTo0(1, false)).toBe(0);
  });
});
