import { SortedIndexSet } from "../sorted-index-set";

function withListener(values: number[]) {
  const set = new SortedIndexSet();
  for (const v of values) {
    set.push(v);
  }
  const calls: Array<[number[], number[], number]> = [];
  set.addRangeChangeListener((plus, minus, at) => calls.push([plus, minus, at]));
  return { set, calls };
}

describe("SortedIndexSet", () => {
  it("keeps values in ascending order", () => {
    const { set } = withListener([5, 1, 3]);
    expect(set.toArray()).toEqual([1, 3, 5]);
    expect(set.length).toBe(3);
    expect([...set]).toEqual([1, 3, 5]);
  });

  it("reports insert position after insertion", () => {
    const { set, calls } = withListener([1, 5]);
    set.push(3);
    expect(calls).toEqual([[[3], [], 1]]);
  });

  it("reports removal position before removal", () => {
    const { set, calls } = withListener([1, 3, 5]);
    expect(set.delete(5)).toBe(true);
    expect(calls).toEqual([[[], [5], 2]]);
    expect(set.toArray()).toEqual([1, 3]);
  });

  it("ignores duplicate push", () => {
    const { set, calls } = withListener([1]);
    set.push(1);
    expect(set.length).toBe(1);
    expect(calls).toEqual([]);
  });

  it("ignores deleting an absent value", () => {
    const { set, calls } = withListener([1, 3]);
    expect(set.delete(9)).toBe(false);
    expect(set.delete(2)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("has and map", () => {
    const { set } = withListener([4, 2]);
    expect(set.has(2)).toBe(true);
    expect(set.has(3)).toBe(false);
    expect(set.map((v, i) => `${i}:${v}`)).toEqual(["0:2", "1:4"]);
  });

  // collections' SortedSet degenerated into a chain on ascending pushes and overflowed the stack
  it("handles many ascending pushes", () => {
    const set = new SortedIndexSet();
    for (let i = 0; i < 100000; i++) {
      set.push(i);
    }
    expect(set.map((v) => v).length).toBe(100000);
    expect(set.has(99999)).toBe(true);
  });
});
