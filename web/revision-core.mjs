export function selectRevision(catalog,search) {
  const id=new URLSearchParams(search).get('rev')??catalog.current;
  const version=catalog.versions.find(item=>item.id===id);
  if(!version)throw new Error(`Unknown revision: ${id}. Select an available revision above.`);
  return version;
}
export function revisionUrl(href,id,base) {
  const url=new URL(href,base);url.searchParams.set('rev',id);return url.href;
}
export function artifactUrl(version,key) {
  const value=version.artifacts?.[key];
  if(!value)return null;
  if(value.startsWith('/')||value.includes('..')||value.includes('\\')||/^[a-z]+:/i.test(value))throw new Error(`Unsafe artifact path: ${key}`);
  return value;
}
