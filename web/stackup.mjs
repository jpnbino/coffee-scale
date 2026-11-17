import { selectedPromise,artifactUrl } from './revision.mjs';
const root = document.getElementById('stackup-content');
const text = (tag,value) => Object.assign(document.createElement(tag),{textContent:value});
try {
  const response = await fetch(artifactUrl(await selectedPromise,'stackup')); if (!response.ok) throw new Error('Stackup export missing');
  const stack = await response.json();
  root.replaceChildren();
  root.append(text('p',`${stack.boardThicknessMm} mm nominal board · ${stack.finish} finish · ${stack.status}`));
  const diagram = document.createElement('div'); diagram.className='stackup-diagram';
  for (const layer of stack.layers) {
    const row=document.createElement('div'); row.className='stackup-layer';
    row.dataset.kind=layer.type==='copper'?'copper':layer.material?'core':layer.name.endsWith('Mask')?'mask':'surface';
    row.append(text('strong',layer.name),text('span',[layer.type,layer.material,layer.color,layer.thicknessMm===null?'Thickness unspecified':`${layer.thicknessMm} mm`,layer.epsilonR?`εr ${layer.epsilonR} · tan δ ${layer.lossTangent}`:''].filter(Boolean).join(' · ')));
    diagram.append(row);
  }
  root.append(diagram,text('p','Schematic cross-section, not to scale. Paste and silkscreen are surface processes; unspecified thickness is not zero. Dielectric properties are design entries, not certified material measurements.'));
  root.append(text('p',`PCB source SHA-256: ${stack.sourceSha256}`));
} catch(error) {root.textContent=`Stackup unavailable: ${error.message}`;}
