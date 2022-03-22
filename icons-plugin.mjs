import got from "got";

import valueParser from "postcss-value-parser";
import { transform, encode } from "postcss-inline-svg/lib/defaults.js";

const map = new Map();

const FUNCTION_NAME = "icon";

const requireIconSvg = (iconId) => {
  return new Promise((resolve) => {
    got(`https://fonts.gstatic.com/s/i/materialicons/${iconId}/24px.svg?download=true`, {
      cache: map,
    }).then((response) => {
      resolve(response.body);
    });
  });
};

const plugin = () => ({
  postcssPlugin: "icons", 
  async Declaration(decl) {
    let value = decl.value;
    
    if (value.indexOf(FUNCTION_NAME) === -1) {
      return;
    }
    
    const parsed = valueParser(value);
    const [functionNode] = parsed.nodes;

    if (functionNode.type !== "function") {
      return;
    }

    if (functionNode.value !== FUNCTION_NAME) {
      return;
    }

    const [iconIdNode] = functionNode.nodes;

    if (iconIdNode.type !== "string") {
      throw new Error(`Invalid decl ${value}`);
    }

    const iconId = iconIdNode.value;

    const svg = await requireIconSvg(iconId);

    const dataUri = transform(encode(svg));
  
    functionNode.value = "url";
    functionNode.nodes = [
      {
        type: "word",
        value: dataUri,
      },
    ];

    decl.value = parsed.toString();     
  },
});

export const postcss = true;

export default plugin;
