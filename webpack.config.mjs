import path from "path";
import { fileURLToPath } from "url";

import HtmlWebpackPlugin from "html-webpack-plugin";
import { CleanWebpackPlugin } from "clean-webpack-plugin";

import InlinePlugin from "./inline-plugin.mjs";
import iconsPlugin from "./icons-plugin.mjs";

import autoprefixer from "autoprefixer";
import postcssNormalize from "postcss-normalize";
import postcssReporter from "postcss-reporter";

// https://bobbyhadz.com/blog/javascript-dirname-is-not-defined-in-es-module-scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const base = {
  entry: "./src/index.ts",
  devtool: "source-map",
  output: {
    filename: "bundle.[contenthash].js",
    path: path.resolve(__dirname, "dist"),
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: ["babel-loader", "ts-loader"],
      },
      {
        test: /\.scss$/,
        exclude: /node_modules/,
        use: [
          "raw-loader",
          {
            loader: "postcss-loader",
            options: {
              sourceMap: true,
              postcssOptions: {
                plugins: [
                  autoprefixer(),
                  iconsPlugin(),
                  postcssNormalize(),
                  postcssReporter(),
                ],
              },
            },
          },
          {
            loader: "sass-loader",
            options: {
              sourceMap: true,
            },
          },
        ],
      },
    ],
  },
  infrastructureLogging: {
    appendOnly: true,
    level: "verbose",
    debug: true,
  },
};


export default (env) => {
let config = {
    mode: "development",
    ...base,
    plugins: [new HtmlWebpackPlugin({ title: "qualitycheck" })],
    devServer: {
      compress: true,
      static: path.resolve(__dirname, "public"),
    },
  };

  if (env.WEBPACK_BUILD) {
    config = {
      mode: "production",
      ...base,
      plugins: [
        new HtmlWebpackPlugin({
          title: "qualitycheck",
          inject: "body",
        }),
        new InlinePlugin(),
        new CleanWebpackPlugin(),
      ],
      optimization: {
        usedExports: true,
        splitChunks: {
          name: false,
        },
        concatenateModules: true,
      },
    };
  }

  return config;
};
