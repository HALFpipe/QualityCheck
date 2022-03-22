import HtmlWebpackPlugin from "html-webpack-plugin";

export default class InlinePlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap("inline-plugin", (compilation) => {
      const hooks = HtmlWebpackPlugin.getHooks(compilation);
      hooks.alterAssetTagGroups.tap("inline-plugin", (assets) => {
        const inline = (tag) => {
          if (
            tag.tagName === "script" &&
            tag.attributes &&
            tag.attributes.src
          ) {
            const key = tag.attributes.src.replace(/^\/+/g, "");
            const asset = compilation.assets[key];
            if (asset) {
              delete compilation.assets[key];
              return {
                tagName: "script",
                innerHTML: asset.source(),
                voidTag: false,
              };
            }
          } else if (
            tag.tagName === "link" &&
            tag.attributes &&
            tag.attributes.rel === "stylesheet" &&
            tag.attributes.href
          ) {
            const key = tag.attributes.href.replace(/^\/+/g, "");
            const asset = compilation.assets[key];
            if (asset) {
              delete compilation.assets[key];
              return {
                tagName: "style",
                attributes: {
                  type: "text/css",
                },
                innerHTML: asset.source(),
                voidTag: false,
              };
            }
          }
          return tag;
        };

        assets.headTags = assets.headTags.map(inline);
        assets.bodyTags = assets.bodyTags.map(inline);
      });
    });
  }
}
