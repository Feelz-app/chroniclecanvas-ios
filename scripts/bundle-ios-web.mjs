import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const entryFile = path.join(root, "www", "script.js");
const outfile = path.join(root, "www", "app-bundle.js");

await build({
  entryPoints: [entryFile],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["safari16", "ios16"],
  sourcemap: false,
  legalComments: "none",
  logLevel: "info"
});

console.log("Bundled Chronicle Canvas iOS web app into www/app-bundle.js");
