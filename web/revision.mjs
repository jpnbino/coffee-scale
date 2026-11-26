import { catalogPromise } from './review-data.mjs';
import { selectRevision,revisionUrl,artifactUrl } from './revision-core.mjs';
export { artifactUrl };
export function changeRevision(id) {location.assign(revisionUrl(location.href,id,location.href));}
export const selectedPromise=(async()=>{
  const select=document.getElementById('global-revision'),status=document.getElementById('revision-status');
  try {
    const catalog=await catalogPromise;
    select.replaceChildren();
    for(const version of catalog.versions){const option=document.createElement('option');option.value=version.id;option.textContent=version.label;select.append(option);}
    select.disabled=false;select.addEventListener('change',()=>changeRevision(select.value));
    const version=selectRevision(catalog,location.search);select.value=version.id;
    history.replaceState(null,'',revisionUrl(location.href,version.id,location.href));
    const historical=version.id!==catalog.current;
    document.documentElement.dataset.revision=version.id;
    for(const badge of document.querySelectorAll('.edition,.topline>span:last-child,.revision-badge'))badge.textContent=version.label;
    status.textContent=`${version.label} · ${version.validation} · PCB ${version.boardSha256.slice(0,12)}…`;status.title=`PCB SHA-256 ${version.boardSha256}`;
    for(const element of document.querySelectorAll('[data-artifact]')){
      const url=artifactUrl(version,element.dataset.artifact);
      if(!url){element.removeAttribute('href');element.setAttribute('aria-disabled','true');element.textContent+=' — unavailable for this revision';continue;}
      if(element.tagName==='A')element.setAttribute('href',url);
      else if(element.tagName==='IMG')element.setAttribute('src',url);
      else element.dataset.src=url;
    }
    for(const link of document.querySelectorAll('a[href]')){
      const url=new URL(link.getAttribute('href'),location.href);
      if(url.origin===location.origin&&url.pathname.endsWith('.html'))link.href=revisionUrl(url.href,version.id,location.href);
    }
    const model=document.querySelector('model-viewer');if(model)model.setAttribute('poster',artifactUrl(version,'hero'));
    const hero=document.querySelector('.hero img');if(hero)hero.alt=`Top view of ${version.label}`;
    const statisticsLabel=document.getElementById('statistics-version');if(statisticsLabel)statisticsLabel.textContent=version.label;
    const caption=document.querySelector('.hero figcaption');if(caption)caption.textContent=`${version.label}. Re-rendered from verified source; physical fit remains provisional.`;
    const notice=document.querySelector('#overview .notice');if(notice)notice.textContent=`Prototype, not bench-validated hardware. ${version.validation}. Assembly sourcing, battery approval, firmware and physical fit still need review.`;
    for(const footer of document.querySelectorAll('footer p'))footer.textContent=`Selected: ${version.label} · ${version.buildId??'Historical snapshot; original build ID not recorded'}`;
    const railNote=document.querySelector('.rail-note');if(railNote)railNote.textContent='All available design views and downloads follow the selected revision. Missing historical records are explicitly unavailable.';
    if(historical){
      for(const section of document.querySelectorAll('.doc-article,#documentation-index'))section.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Revision-specific documentation was not archived for this snapshot. Select the current build to read its guides. No current-build guide is substituted here.'}));
      const build=document.querySelector('#downloads>p:not(.eyebrow)');if(build)build.textContent='Historical snapshot artifacts; review models re-exported with the current toolchain.';
    }
    document.documentElement.classList.remove('revision-loading');
    return version;
  }catch(error){select.value='';status.textContent=`Revision unavailable: ${error.message}`;throw error;}
})();
// Keep the error message visible without an unhandled rejection on landing pages.
selectedPromise.catch(()=>{});
