import './platform.css';
interface InstallPrompt extends Event {prompt():Promise<void>;userChoice:Promise<{outcome:string}>}
export function initPlatform(notice:(message:string)=>void){
  const dock=document.createElement('div');dock.className='platform-tools';
  const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.textContent='⛶';fullscreen.title='Fullscreen';fullscreen.setAttribute('aria-label','Toggle fullscreen');
  fullscreen.addEventListener('click',async()=>{
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else if(typeof document.documentElement.requestFullscreen==='function') await document.documentElement.requestFullscreen();
      else notice('Use your browser’s fullscreen option on this device.');
    } catch {notice('Use your browser’s fullscreen option on this device.');}
  });dock.append(fullscreen);
  const install=document.createElement('button');install.type='button';install.textContent='Install game';install.hidden=true;let prompt:InstallPrompt|null=null;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event as InstallPrompt;install.hidden=false;});
  install.addEventListener('click',async()=>{
    const invitation=prompt;if(!invitation)return;
    // Browser install invitations are single-use, even when dismissed.
    prompt=null;install.hidden=true;
    try {await invitation.prompt();await invitation.userChoice;}
    catch {notice('Installation is unavailable right now. You can keep playing in your browser.');}
  });
  window.addEventListener('appinstalled',()=>{install.hidden=true;notice('Zoo Garden is installed. Your offline adventure is ready anywhere.');});dock.append(install);const slot=document.querySelector('#platform-slot');if(slot)slot.append(dock);else document.body.append(dock);
  if('serviceWorker' in navigator&&import.meta.env.PROD)void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(()=>{});
}


