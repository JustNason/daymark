import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await cp("manifest.json", "dist/manifest.json");
await cp("popup.html", "dist/popup.html");
await cp("popup.css", "dist/popup.css");
await cp("public", "dist/public", { recursive: true });
