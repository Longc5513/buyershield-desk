import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = normalize(join(process.cwd(), "site"));
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : String(req.url || "/index.html");
  const filePath = normalize(join(root, urlPath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const type = contentTypes[ext] || "text/plain; charset=utf-8";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(filePath));
}).listen(port, () => {
  console.log(`BuyerShield Desk running at http://localhost:${port}`);
});
