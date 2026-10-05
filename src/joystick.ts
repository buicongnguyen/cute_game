import {JoystickInput} from './gameplay-controls.ts';
import {t,onLanguageChange} from './i18n.ts';
import './joystick.css';

export function mountJoystick(host:HTMLElement,canMove:()=>boolean,change:(direction:{x:number;z:number}|null)=>void){
  const input=new JoystickInput(),stick=document.createElement('div'),knob=document.createElement('span');
  stick.id='movement-joystick';stick.className='movement-joystick';stick.setAttribute('role','group');knob.className='joystick-knob';knob.setAttribute('aria-hidden','true');stick.append(knob);host.append(stick);
  let enabled=false,cx=0,cy=0;
  const label=()=>stick.setAttribute('aria-label',t('Movement joystick'));label();onLanguageChange(label);
  const render=()=>{knob.style.transform=`translate(${input.x}px,${input.z}px)`;change(enabled&&canMove()?input.direction:null);};
  // Forget the hold before releasing capture: lostpointercapture can arrive during cleanup.
  const clear=()=>{const pointer=input.pointer;input.end();if(pointer!==null&&stick.hasPointerCapture(pointer))stick.releasePointerCapture(pointer);render();};
  stick.addEventListener('pointerdown',event=>{if(event.button!==0||!enabled||!canMove()||!input.begin(event.pointerId))return;event.preventDefault();event.stopPropagation();const rect=stick.getBoundingClientRect();cx=rect.left+rect.width/2;cy=rect.top+rect.height/2;stick.setPointerCapture(event.pointerId);input.move(event.pointerId,event.clientX-cx,event.clientY-cy);render();});
  stick.addEventListener('pointermove',event=>{if(event.pointerId!==input.pointer)return;event.preventDefault();event.stopPropagation();if(!enabled||!canMove()){clear();return;}input.move(event.pointerId,event.clientX-cx,event.clientY-cy);render();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)stick.addEventListener(name,event=>{if(event.pointerId!==input.pointer)return;event.stopPropagation();clear();});
  window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);
  // Rotation moves the stick's centre; require a fresh press in the new layout.
  window.addEventListener('resize',clear);window.addEventListener('orientationchange',clear);
  return {clear,setEnabled(value:boolean){enabled=value;stick.hidden=!value;host.classList.toggle('joystick-on',value);clear();},update(){if(input.pointer!==null){if(!enabled||!canMove())clear();else render();}}};
}
