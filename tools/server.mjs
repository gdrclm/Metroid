import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const repo = fileURLToPath(new URL("../", import.meta.url));
const root = resolve(repo, process.argv.includes("--dist") ? "dist" : ".");
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || "0.0.0.0";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8",
};
createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }
    const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ),
      parts = pathname.split("/");
    if (parts.some((p) => p.startsWith("."))) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const file = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(root + sep) || (await stat(file)).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const contents = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : contents);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, host, () =>
  console.log(`Последний причал · ${root} · port ${port}`),
);
