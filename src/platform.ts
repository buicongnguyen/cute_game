import './platform.css';
import { t, onLanguageChange } from './i18n.ts';
interface InstallPrompt extends Event {prompt():Promise<void>;userChoice:Promise<{outcome:string}>}
export function initPlatform(notice:(message:string)=>void){
  const dock=document.createElement('div');dock.className='platform-tools';
  const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.textContent='⛶';fullscreen.title=t('Fullscreen');fullscreen.setAttribute('aria-label',t('Toggle fullscreen'));
  fullscreen.addEventListener('click',async()=>{
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else if(typeof document.documentElement.requestFullscreen==='function') await document.documentElement.requestFullscreen();
      else notice(t('Use your browser’s fullscreen option on this device.'));
    } catch {notice(t('Use your browser’s fullscreen option on this device.'));}
  });dock.append(fullscreen);
  const install=document.createElement('button');install.type='button';install.textContent=t('Install game');install.hidden=true;let prompt:InstallPrompt|null=null;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event as InstallPrompt;install.hidden=false;});
  install.addEventListener('click',async()=>{
    const invitation=prompt;if(!invitation)return;
    // Browser install invitations are single-use, even when dismissed.
    prompt=null;install.hidden=true;
    try {await invitation.prompt();await invitation.userChoice;}
    catch {notice(t('Installation is unavailable right now. You can keep playing in your browser.'));}
  });
  window.addEventListener('appinstalled',()=>{install.hidden=true;notice(t('Zoo Garden is installed. Your offline adventure is ready anywhere.'));});dock.append(install);const slot=document.querySelector('#platform-slot');if(slot)slot.append(dock);else document.body.append(dock);
  onLanguageChange(()=>{fullscreen.title=t('Fullscreen');fullscreen.setAttribute('aria-label',t('Toggle fullscreen'));install.textContent=t('Install game');});
  if('serviceWorker' in navigator&&import.meta.env.PROD)void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(()=>{});
}


