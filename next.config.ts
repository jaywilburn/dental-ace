import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Puppeteer + serverless Chromium must not be bundled by Turbopack/webpack.
  // pdfkit must stay external too: when bundled, its runtime fs.readFileSync of
  // the .afm standard-font data resolves to a fake /ROOT/... path and every PDF
  // render (approval letters, certificates) throws ENOENT.
  // @napi-rs/canvas ships a native .node addon (marketing-logo rendering) that
  // must not be bundled either.
  serverExternalPackages: [
    "@sparticuz/chromium",
    "puppeteer-core",
    "pdfkit",
    "@napi-rs/canvas",
  ],
};

export default nextConfig;
