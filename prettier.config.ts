// prettier.config.ts, .prettierrc.ts, prettier.config.mts, or .prettierrc.mts

import { type Config } from "prettier";

const config: Config = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  jsxSingleQuote: false,
  trailingComma: "all",
  bracketSameLine: false,
  arrowParens: "always",
  proseWrap: "always",
  endOfLine: "lf",
  quoteProps: "as-needed",
  overrides: [
    {
      files: ["*.yaml", "*.yml"],
      options: {
        proseWrap: "preserve",
      },
    },
  ],
};

export default config;
