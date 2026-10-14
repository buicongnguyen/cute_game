import './platform.css';
import './open-outside.css';
import { t, onLanguageChange } from './i18n.ts';
import { registerWorker } from './art-status.ts';
import { initOpenOutside } from './open-outside.ts';
interface InstallPrompt extends Event {prompt():Promise<void>;userChoice:Promise<{outcome:string}>}
type FullDoc=Document&{webkitFullscreenElement?:Element|null;webkitExitFullscreen?:()=>Promise<void>|void};
type FullEl=HTMLElement&{webkitRequestFullscreen?:(options?:FullscreenOptions)=>Promise<void>|void};
const doc=document as FullDoc,root=()=>document.documentElement as FullEl;
const inFullscreen=()=>!!(doc.fullscreenElement||doc.webkitFullscreenElement);
/** Whether this browser lets a page fill the screen (iPhone Safari does not; there only Add to Home Screen does). */
export const canFullscreen=()=>typeof root().requestFullscreen==='function'||typeof root().webkitRequestFullscreen==='function';
const iPhone=()=>/iPhone|iPod/.test(globalThis.navigator?.userAgent??'');
const media=(query:string)=>!!globalThis.matchMedia?.(query)?.matches;
const standalone=()=>media('(display-mode: fullscreen), (display-mode: standalone)')||(navigator as Navigator&{standalone?:boolean}).standalone===true;
async function enterFullscreen(){
  const el=root(),options:FullscreenOptions={navigationUI:'hide'};
  if(typeof el.requestFullscreen==='function')await el.requestFullscreen(options);else await el.webkitRequestFullscreen?.(options);
  // A phone game plays sideways once full screen; ignored where the browser does not allow locking.
  try{if(innerWidth>innerHeight)await (globalThis.screen?.orientation as ScreenOrientation&{lock?:(o:string)=>Promise<void>}).lock?.('landscape');}catch{}
}
/** Set when the player leaves full screen themselves: the game then stops entering it on its own until the next visit. */
let leftByChoice=false;
export async function toggleFullscreen(notice:(message:string)=>void){
  try {
    if(inFullscreen()){leftByChoice=true;if(doc.exitFullscreen)await doc.exitFullscreen();else await doc.webkitExitFullscreen?.();}
    else if(canFullscreen()){leftByChoice=false;await enterFullscreen();}
    else notice(t(!iPhone()||standalone()?'Use your browser’s fullscreen option on this device.':'For full screen on iPhone, tap Share and then Add to Home Screen, and play from the new icon.'));
  }catch{notice(t('Use your browser’s fullscreen option on this device.'));}
}
/**
 * Phones in landscape: the browser's bars eat a third of a short screen. A page may only go full screen from a tap,
 * so the first tap while sideways does it (and again after the browser drops it, e.g. on returning to the tab), unless
 * the player left full screen with the button. iPhone Safari cannot, so it gets a one-time Add to Home Screen hint.
 */
function autoFullscreen(notice:(message:string)=>void){
  const phone=media('(pointer: coarse)')&&typeof screen!=='undefined'&&Math.min(screen.width,screen.height)<=600;
  if(!phone||standalone()&&!canFullscreen())return;
  let hinted=false;
  addEventListener('pointerup',event=>{
    if(event.pointerType!=='touch'||innerWidth<=innerHeight||inFullscreen()||leftByChoice)return;
    if(canFullscreen()){void enterFullscreen().catch(()=>{});return;}
    if(!hinted&&iPhone()&&!standalone()){hinted=true;notice(t('For full screen on iPhone, tap Share and then Add to Home Screen, and play from the new icon.'));}
  },{capture:true,passive:true});
}
export function initPlatform(notice:(message:string)=>void){
  const dock=document.createElement('div');dock.className='platform-tools';
  const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.textContent='⛶';fullscreen.title=t('Fullscreen');fullscreen.setAttribute('aria-label',t('Toggle fullscreen'));
  fullscreen.addEventListener('click',()=>void toggleFullscreen(notice));dock.append(fullscreen);autoFullscreen(notice);initOpenOutside();
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
  if(import.meta.env.PROD)registerWorker(`${import.meta.env.BASE_URL}sw.js`);
}


