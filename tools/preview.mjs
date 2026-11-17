import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "");
const port = Number(process.argv[3] || 8787);
if (!existsSync(path.join(root, "index.html"))) throw new Error("Preview directory has no index.html");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs":"text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".png": "image/png", ".pdf": "application/pdf", ".zip": "application/zip", ".md": "text/plain", ".txt": "text/plain", ".kicad_sch": "text/plain", ".kicad_pcb": "text/plain" };
const server = http.createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let file;
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error("Path outside site");
    if (!statSync(file).isFile()) throw new Error("Not a file");
  } catch { response.writeHead(404); response.end("Not found"); return; }
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Content-Length": statSync(file).size, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
  if (request.method === "HEAD") { response.end(); return; }
  const stream = createReadStream(file);
  stream.on("error", () => response.destroy()); stream.pipe(response);
});
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Local preview: http://127.0.0.1:${port}\nServing ${root}\nCtrl+C to stop. No external publishing.`));
