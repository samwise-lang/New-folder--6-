"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

async function build() {
  const outputDirectory = path.join(__dirname, "..", "dist");
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.copyFile(
    path.join(__dirname, "..", "products.html"),
    path.join(outputDirectory, "index.html")
  );
}

build().catch((error) => {
  console.error("Could not build the Netlify site:", error);
  process.exitCode = 1;
});
