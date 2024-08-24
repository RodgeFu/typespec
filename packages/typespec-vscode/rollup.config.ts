import babel from '@rollup/plugin-babel';
import commonjs from "@rollup/plugin-commonjs";
import json from '@rollup/plugin-json';
import resolve from "@rollup/plugin-node-resolve";
import replace from '@rollup/plugin-replace';
import typescript from "@rollup/plugin-typescript";
import postcss from "rollup-plugin-postcss";

import { defineConfig } from "rollup";

export default defineConfig([{
  input: "src/extension.ts",
  output: {
    file: "dist/src/extension.cjs",
    format: "cjs",
    sourcemap: true,
    exports: "named",
    inlineDynamicImports: true,
  },
  external: ["fs/promises", "vscode"],
  plugins: [
    (resolve as any)({ preferBuiltins: true }),
    (commonjs as any)(),
    (typescript as any)({ tsconfig: "./tsconfig.build.json" }),
    (json as any)(),
    (postcss as any)(),
  ],
  onwarn: (warning, warn) => {
    if (warning.code === "CIRCULAR_DEPENDENCY") {
      // filter out warnings about circular dependencies out of our control
      for (const each of ["node_modules/semver"]) {
        if (warning.message.includes(each)) {
          return;
        }
      }
    }
    warn(warning);
  },
},
{
  input: "src/webview/index.tsx",
  output: {
    file: "./dist/webview/bundled.js",
    format: "iife",
    sourcemap: true,
    exports: "named",
    inlineDynamicImports: true,
    //banner: "'use client';"
  },
  external: ["fs/promises", "vscode", "ajv", "monaco-editor"],
  plugins: [
    (typescript as any)({ tsconfig: "./tsconfig.build.json" }),
    (json as any)(),
    (resolve as any)({ preferBuiltins: true }),
    (commonjs as any)(),
    (babel as any)({
      babelHelpers: 'bundled',
      presets: ['@babel/preset-react', '@babel/preset-typescript'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.es6', '.es', '.mjs']
    }),
    (replace as any)({
      preventAssignment: false,
      'process.env.NODE_ENV': '"development"'
    }),
    (postcss as any)(),
  ],
  onwarn: (warning, warn) => {
    if (warning.code === "CIRCULAR_DEPENDENCY") {
      // filter out warnings about circular dependencies out of our control
      for (const each of ["node_modules/semver"]) {
        if (warning.message.includes(each)) {
          return;
        }
      }
    }
    // else if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
    //   return;
    // }
    warn(warning);
  },
}
]);
