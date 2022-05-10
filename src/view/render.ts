export class Attribute {
  key: string;
  value: string;

  constructor(key: string, value: string) {
    this.key = key;
    this.value = value;
  }
}

// inspired by hyperscript
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attribute[], children: Node[]): HTMLElementTagNameMap[K] {
  let element = document.createElement(tag);

  for (let attr of attrs) {
    element.setAttribute(attr.key, attr.value);
  }

  for (let child of children) {
    if (child !== undefined) {
      element.appendChild(child);
    }
  }

  return element;
}

export function t(s: string): Node {
  return document.createTextNode(s);
}
