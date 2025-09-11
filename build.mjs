import {build} from "esbuild";

await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outfile: "dist/lib/index.js",
    format: "iife",
    globalName: "Cryo",
    platform: "browser",
    sourcemap: true,
    minify: true,
    legalComments: "inline",
    treeShaking: true,
    logLevel: "info",
})
