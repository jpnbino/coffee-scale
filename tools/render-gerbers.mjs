import { readFileSync,writeFileSync,readdirSync,mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { fileURLToPath,pathToFileURL } from "node:url";
import path from "node:path";

const bundle=fileURLToPath(new URL("../web/vendor/gerber-to-svg-4.2.8.min.cjs",import.meta.url));
const expected="8f16104893ab462f0bc1513ac2c6508fce59fcb10fab648848dddcfa7aafb76c";
let renderer;
function loadRenderer(){
  if(renderer)return renderer;
  const code=readFileSync(bundle,"utf8");
  if(createHash("sha256").update(code).digest("hex")!==expected)throw new Error("Gerber renderer checksum mismatch");
  const context={setTimeout,clearTimeout,console};
  runInNewContext(code,context,{filename:bundle,timeout:5000});
  renderer=context.gerberToSvg;
  if(typeof renderer!=="function")throw new Error("Gerber renderer entry point missing");
  return renderer;
}
export function renderGerber(source,id="layer",options={}){
  return new Promise((resolve,reject)=>{
    const warnings=[];let converter;
    converter=loadRenderer()(source,{...options,id},(error,svg)=>{
      if(error){reject(error);return;}
      resolve({svg,warnings,units:converter.units,viewBox:[...converter.viewBox]});
    });
    converter.on("warning",warning=>{const message=String(warning.message??warning);warnings.push({message,line:warning.line??null,category:/^block "%T[FAOD]/.test(message)?"metadata":"review-required"});});
    converter.on("error",reject);
  });
}
const names={".gtp":"Top paste (stencil)",".gbp":"Bottom paste (stencil)",".gtl":"Top copper",".gbl":"Bottom copper",".gts":"Top mask openings",".gbs":"Bottom mask openings",".gto":"Top silkscreen",".gbo":"Bottom silkscreen",".gm1":"Board outline"};
/** Renders the fabrication layers in `input`, plus paste layers from each of `extra`. */
export async function renderDirectory(input,output,prefix="gerber",extra=[]){
  mkdirSync(output,{recursive:true});const layers=[];
  const files=[...readdirSync(input).sort().map(name=>[input,name]),...extra.flatMap(dir=>readdirSync(dir).sort().filter(name=>/\.g[tb]p$/i.test(name)).map(name=>[dir,name]))];
  for(const [directory,filename] of files){
    const extension=path.extname(filename).toLowerCase();if(!names[extension]&&extension!==".drl")continue;
    const source=readFileSync(path.join(directory,filename),"utf8"),id=`${prefix}-${layers.length}`;
    const record={name:filename,label:names[extension]??(filename.includes("NPTH")?"Non-plated drills":"Plated drills and slots"),sourceSha256:createHash("sha256").update(source).digest("hex"),kind:extension};
    try{
      const decimalDrill=extension===".drl"&&source.includes("/ decimal}")&&/^METRIC/m.test(source);
      const result=await renderGerber(source,id,decimalDrill?{filetype:"drill",units:"mm",zero:"L"}:{});
      if(result.units!=="mm")throw new Error(`Expected millimetres; renderer reported ${result.units}`);
      if(result.viewBox.length!==4||!result.viewBox.every(Number.isFinite)||result.viewBox[2]<=0||result.viewBox[3]<=0)throw new Error("Invalid layer bounds");
      // The renderer mirrors around each layer's own midpoint. Remove that
      // per-layer offset so all SVGs share absolute KiCad X-right/Y-down axes.
      const [x,y,w,h]=result.viewBox,canonical=[x,-y-h,w,h],offset=-(2*y+h);
      let svg=result.svg.replace(/viewBox="[^"]*"/,`viewBox="${canonical.join(" ")}"`);
      svg=svg.replace(/(<svg\b[^>]*>)/,`$1<g transform="translate(0,${offset})">`).replace('</svg>','</g></svg>');
      const target=filename+".svg";writeFileSync(path.join(output,target),svg);
      Object.assign(record,{available:true,svg:target,viewBox:canonical,units:result.units,warnings:result.warnings,assumptions:decimalDrill?["Explicit-decimal metric drill file; leading suppression option is immaterial to decimal coordinates."]:[]});
    }catch(error){Object.assign(record,{available:false,error:error.message});}
    layers.push(record);
  }
  const report={schemaVersion:1,renderer:"gerber-to-svg 4.2.8",rendererSha256:expected,coordinateConvention:"SVG viewBox in 1000x mm; absolute KiCad X right / Y down; per-layer midpoint offsets removed",layers};
  writeFileSync(path.join(output,"layers.json"),JSON.stringify(report,null,2));
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await renderDirectory(process.argv[2],process.argv[3],process.argv[4]??"gerber",process.argv.slice(5));
  console.log(JSON.stringify({layers:report.layers.length,failed:report.layers.filter(l=>!l.available).map(l=>({name:l.name,error:l.error})),metadataWarnings:report.layers.flatMap(l=>l.warnings??[]).filter(w=>w.category==="metadata").length,reviewWarnings:report.layers.flatMap(l=>l.warnings??[]).filter(w=>w.category!=="metadata")}));
}
