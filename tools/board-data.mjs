import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parseSexpr, child, children, atom, number, point, angle } from "./kicad-sexpr.mjs";

const rounded = value => Number(value.toFixed(6));
function transform(x, y, rotation, local) {
  const a = rotation * Math.PI / 180;
  return [rounded(x + local[0] * Math.cos(a) + local[1] * Math.sin(a)), rounded(y - local[0] * Math.sin(a) + local[1] * Math.cos(a))];
}
export function boardData(source) {
  const board = parseSexpr(source);
  if (board[0] !== "kicad_pcb") throw new Error("Expected a KiCad PCB file");
  const nets = new Map(children(board, "net").map(net => [net[1], net[2] ?? net[1]]));
  const netName = node => { const net = child(node, "net"); return net ? (net.length > 2 ? net[2] : nets.get(net[1]) ?? net[1]) : ""; };
  const components = children(board, "footprint").map(footprint => {
    const at = child(footprint, "at"), [x, y] = point(at), rotation = angle(at?.[3]);
    const fields = Object.fromEntries(children(footprint, "property").map(p => [p[1], p[2]]));
    const pads = children(footprint, "pad").map(pad => {
      const local = point(child(pad, "at")), position = transform(x, y, rotation, local);
      const drill = child(pad, "drill")?.slice(1).filter(value => Number.isFinite(Number(value))) ?? [];
      const size = point(child(pad, "size"));
      return { number: pad[1], type: pad[2], shape: pad[3], x: position[0], y: position[1], local, width: size[0], height: size[1], angle: angle(child(pad,"at")?.[3] ?? rotation), layers: child(pad,"layers")?.slice(1) ?? [], drill: drill.map(Number), net: netName(pad) };
    });
    const padSignature = pads.map(p => [p.number,p.type,p.shape,p.local,p.width,p.height,angle(p.angle-rotation),p.layers,p.drill,p.net]).map(JSON.stringify).sort();
    return { id: atom(footprint,"uuid",atom(footprint,"tstamp",fields.Reference)), ref: fields.Reference ?? atom(footprint,"fp_text"), value: fields.Value ?? "", footprint: footprint[1], x,y,rotation,layer:atom(footprint,"layer"),pads,padSignature };
  });
  const segments = children(board,"segment").map(s => ({ id:atom(s,"uuid"), start:point(child(s,"start")), end:point(child(s,"end")), width:number(atom(s,"width")), layer:atom(s,"layer"), net:netName(s) }));
  const arcs = children(board,"arc").map(s => ({ id:atom(s,"uuid"), start:point(child(s,"start")), mid:point(child(s,"mid")), end:point(child(s,"end")), width:number(atom(s,"width")), layer:atom(s,"layer"), net:netName(s) }));
  const vias = children(board,"via").map(v => ({ id:atom(v,"uuid"), at:point(child(v,"at")), diameter:number(atom(v,"size")), drill:number(atom(v,"drill")), layers:child(v,"layers")?.slice(1) ?? [], type:v.includes("micro") ? "micro" : v.includes("blind") ? "blind/buried" : "through", net:netName(v) }));
  const outline = board.filter(s => Array.isArray(s) && /^gr_/.test(s[0]) && atom(s,"layer") === "Edge.Cuts").map(s => ({ shape:s[0], start:point(child(s,"start")),end:point(child(s,"end")),mid:point(child(s,"mid")),points:children(child(s,"pts") ?? [],"xy").map(point),radius:number(atom(s,"radius")) }));
  const points = outline.flatMap(s => s.shape === "gr_poly" ? s.points : [s.start,s.end]);
  if (!points.length) throw new Error("No supported board outline geometry found");
  const bounds = { minX:Math.min(...points.map(p=>p[0])), minY:Math.min(...points.map(p=>p[1])), maxX:Math.max(...points.map(p=>p[0])), maxY:Math.max(...points.map(p=>p[1])) };
  const segmentLengthMm = segments.reduce((sum,s)=>sum+Math.hypot(s.end[0]-s.start[0],s.end[1]-s.start[1]),0);
  return { schemaVersion:1, boardSha256:createHash("sha256").update(source).digest("hex"), components,segments,arcs,vias,outline,bounds, routing:{segmentObjects:segments.length,arcObjects:arcs.length,straightTrackLengthMm:rounded(segmentLengthMm)}, limitations:["Comparison does not include filled copper zones, artwork, design rules or schematic-only changes.","Straight collinear splits/merges are normalized; equivalent arc resegmentation is not normalized.","Review geometry is in absolute KiCad millimetres, X right/Y down. Pad display is simplified; manufactured shapes belong in the Gerber view."] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source=readFileSync(process.argv[2],"utf8");
  writeFileSync(process.argv[3],JSON.stringify(boardData(source)));
}
