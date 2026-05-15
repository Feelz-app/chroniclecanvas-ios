import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.resolve(
  root,
  "..",
  "..",
  "..",
  "Desktop",
  "Chonicle Canvas",
  "Interactive Timeline App"
);
const targetDir = path.join(root, "www");

const filesToCopy = [
  ["app.html", "index.html"],
  ["app.html", "app.html"],
  ["style.css", "style.css"],
  ["script.js", "script.js"],
  ["firebase.js", "firebase.js"],
  ["terms.html", "terms.html"],
  ["privacy.html", "privacy.html"],
  ["delete-account.html", "delete-account.html"],
  ["delete-data.html", "delete-data.html"],
  ["delete-center.js", "delete-center.js"]
];

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const nativeSafeFirebase = (contents) => {
  const appCheckBlock = `const isLocalDebugHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

const isNativeChronicleCanvasIos =
  typeof window !== "undefined" &&
  (
    window.Capacitor?.isNativePlatform?.() === true ||
    /iPad|iPhone|iPod/i.test(window.navigator?.userAgent || "")
  );

if (isLocalDebugHost) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

export const appCheck = isNativeChronicleCanvasIos
  ? null
  : initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider("6LfmDb0sAAAAAMVwWqtliUtKsznOTWPXPAf3f9d5"),
      isTokenAutoRefreshEnabled: true
    });`;

  return contents.replace(
    /const isLocalDebugHost[\s\S]*?export const appCheck = initializeAppCheck\(app, \{[\s\S]*?\}\);/,
    appCheckBlock
  );
};

ensureDir(targetDir);

for (const [sourceName, targetName] of filesToCopy) {
  const sourcePath = path.join(sourceDir, sourceName);
  const targetPath = path.join(targetDir, targetName);
  let contents = fs.readFileSync(sourcePath, "utf8");

  if (sourceName === "firebase.js") {
    contents = nativeSafeFirebase(contents);
  }

  fs.writeFileSync(targetPath, contents, "utf8");
}

console.log("Synced Chronicle Canvas web files into iOS wrapper www/");
