const palettes={purple:['#742ca3','#ffffff'],blue:['#1758b5','#ffffff'],green:['#136e42','#ffffff'],black:['#161616','#ffffff'],white:['#eeeeee','#161616']};
export async function initializeColors(viewer) {
  const select=document.getElementById('model-colors');
  if(select.dataset.initialized)return;
  try {
    const {selectedPromise,artifactUrl}=await import('./revision.mjs');
    const response=await fetch(artifactUrl(await selectedPromise,'modelMaterials'),{cache:'no-cache'});if(!response.ok)throw new Error('Material mapping missing');
    const map=await response.json();
    const mask=viewer.model.materials.filter(material=>map.soldermask.includes(material.name));
    const silk=viewer.model.materials.filter(material=>map.silkscreen.includes(material.name));
    if(!mask.length||!silk.length)throw new Error('Board-specific mask/silkscreen materials not found');
    const originals=new Map([...mask,...silk].map(material=>[material,[...material.pbrMetallicRoughness.baseColorFactor]]));
    select.addEventListener('change',()=>{
      const palette=palettes[select.value];
      for(const [materials,index]of [[mask,0],[silk,1]])for(const material of materials)material.pbrMetallicRoughness.setBaseColorFactor(palette?palette[index]:originals.get(material));
    });
    select.dataset.initialized='true';
  } catch(error) {select.disabled=true;document.getElementById('viewer-status').textContent=`Colour presets unavailable: ${error.message}`;}
}
