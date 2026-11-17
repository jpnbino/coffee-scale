// Fullscreen keeps the controls with their viewer. A page overlay is the fallback
// for embedded browsers which do not grant the Fullscreen API permission.
for (const id of ['inspect','gerbers','compare']) {
  const target = document.getElementById(id); if (!target) continue;
  const button = document.createElement('button'); button.type='button'; button.className='fullscreen-button';
  button.textContent='Fullscreen'; button.setAttribute('aria-pressed','false'); target.prepend(button);
  const update = () => { const active = document.fullscreenElement === target || target.classList.contains('viewer-expanded'); button.textContent=active?'Exit fullscreen':'Fullscreen'; button.setAttribute('aria-pressed',String(active)); };
  const close = () => { target.classList.remove('viewer-expanded'); document.body.classList.remove('viewer-open'); update(); };
  button.addEventListener('click',async()=>{
    if (document.fullscreenElement === target) { await document.exitFullscreen(); return; }
    if (target.classList.contains('viewer-expanded')) { close(); return; }
    try { await target.requestFullscreen(); } catch { target.classList.add('viewer-expanded'); document.body.classList.add('viewer-open'); }
    update();
  });
  document.addEventListener('fullscreenchange',update);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
}
