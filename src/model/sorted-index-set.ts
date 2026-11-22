export type RangeChangeListener = (plus: number[], minus: number[], at: number) => void;

// Sorted set of numbers backed by an array, with the range-change events of collections' SortedSet:
// an insert reports the position after insertion, a delete the position before removal.
export class SortedIndexSet implements Iterable<number> {
  private values: number[] = [];
  private listeners: RangeChangeListener[] = [];

  get length(): number {
    return this.values.length;
  }

  // index of the first element >= value
  private lowerBound(value: number): number {
    let lo = 0;
    let hi = this.values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.values[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  has(value: number): boolean {
    const i = this.lowerBound(value);
    return this.values[i] === value;
  }

  push(value: number): void {
    const n = this.values.length;
    let at: number;
    if (n === 0 || this.values[n - 1] < value) {
      at = n;
      this.values.push(value);
    } else {
      at = this.lowerBound(value);
      if (this.values[at] === value) {
        return;
      }
      this.values.splice(at, 0, value);
    }
    for (const listener of this.listeners) {
      listener([value], [], at);
    }
  }

  delete(value: number): boolean {
    const at = this.lowerBound(value);
    if (this.values[at] !== value) {
      return false;
    }
    this.values.splice(at, 1);
    for (const listener of this.listeners) {
      listener([], [value], at);
    }
    return true;
  }

  map<U>(fn: (value: number, i: number) => U): U[] {
    return this.values.map((v, i) => fn(v, i));
  }

  toArray(): number[] {
    return [...this.values];
  }

  [Symbol.iterator](): Iterator<number> {
    return this.values[Symbol.iterator]();
  }

  addRangeChangeListener(listener: RangeChangeListener): void {
    this.listeners.push(listener);
  }
}
