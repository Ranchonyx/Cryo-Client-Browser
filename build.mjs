import {build} from "esbuild";

await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outfile: "dist/lib/index.js",
    format: "iife",
    globalName: "Cryo",
    platform: "browser",
    sourcemap: true,
    minify: false,
    legalComments: "inline",
    treeShaking: true
})
