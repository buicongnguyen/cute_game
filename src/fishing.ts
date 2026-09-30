export type FishingPhase = 'cast'|'waiting'|'nibble'|'bite'|'fight'|'caught'|'escaped';
export interface FishingOptions { quality:number; power:number; bait:boolean; random?:()=>number }

/** A deterministic simulation of the visible fishing rules, independent of UI. */
export class FishingSimulation {
  phase:FishingPhase='cast'; tension=.25; progress=.05; time=0; surge=0;missedBites=0;
  /** Counts every nibble so the view can dip the bobber once per nibble. */
  nibbles=0;
  /** Presses before the bite; each one tugs the bobber and scares the fish away. */
  earlyPresses=0;
  reason=''; private timer=.5; private slack=0; private surgeWait=1.2; private nibblesLeft=0;
  private lastHeld=false; private quality:number; private power:number; private bait:boolean; private random:()=>number;
  constructor(options:FishingOptions){this.quality=Math.max(0,options.quality);this.power=Math.max(.1,options.power);this.bait=options.bait;this.random=options.random??Math.random;}
  private between(min:number,max:number){return min+this.random()*(max-min);}
  get fighting(){return this.phase==='fight';}
  get finished(){return this.phase==='caught'||this.phase==='escaped';}
  setBait(available:boolean){this.bait=available;}
  get message(){
    if(this.phase==='cast')return 'Casting your line…';
    if(this.phase==='waiting')return 'Watch the bobber. A fish is approaching.';
    if(this.phase==='nibble')return 'A little nibble… wait for the bite!';
    if(this.phase==='bite')return 'A bite! Press Reel or Space now!';
    if(this.phase==='fight')return this.surge>0?'The fish is surging! Release the line.':this.tension>.78?'Easy now — release before the line snaps.':this.tension<.08?'Keep some tension: reel gently.':'Reel steadily; release during a surge.';
    return this.reason;
  }
  private wait(){this.phase='waiting';this.timer=this.between(2,5.5)/(this.bait?1.7:1)/(1+this.quality*.5);this.nibblesLeft=1+Math.floor(this.random()*4);}
  press(){
    if(this.phase==='bite'){this.phase='fight';this.tension=.25;this.progress=.05;this.slack=0;this.surgeWait=this.between(.5,1.5);return true;}
    if(this.phase==='waiting'||this.phase==='nibble'){this.earlyPresses++;this.phase='waiting';this.timer+=1.5;this.reason='Too early — the fish moved away. Wait for a bite.';}
    return false;
  }
  update(dt:number,held:boolean,active=true){
    if(!active||this.finished)return;
    this.time+=dt;
    if(held&&!this.lastHeld)this.press();this.lastHeld=held;
    if(this.phase==='fight'){
      this.surgeWait-=dt;
      if(this.surge>0)this.surge-=dt;else if(this.surgeWait<=0){this.surge=this.between(.4,.8+this.power);this.surgeWait=this.between(.8,2.2)*Math.max(.1,1.2-this.power*.5);}
      if(held){this.slack=0;this.progress+=dt*.2*Math.max(0,1.15-this.power*.55)*(this.surge>0?.2:1);this.tension+=dt*(1.2-this.quality*.45)*(.16+(this.surge>0?1.25*this.power+.25:.05));if(this.surge>0&&this.random()<dt*Math.max(0,this.power-this.quality)*.25)this.tension=1;}
      else{this.tension=Math.max(0,this.tension-dt*.6);this.progress=Math.max(0,this.progress-dt*.05*this.power*(this.surge>0?2.5:1));this.slack+=dt;}
      if(this.tension>=1){this.phase='escaped';this.reason='The line snapped. Release the reel when the fish surges.';}
      else if(this.slack>4){this.phase='escaped';this.reason='The line went slack and the fish slipped away.';}
      else if(this.progress>=1){this.progress=1;this.phase='caught';this.reason='A lovely catch!';}
      return;
    }
    this.timer-=dt;
    if(this.timer>0)return;
    if(this.phase==='cast')this.wait();
    else if(this.phase==='waiting'){this.phase='nibble';this.nibbles++;this.timer=this.between(.5,1.6);}
    else if(this.phase==='nibble'){
      if(--this.nibblesLeft>0){this.nibbles++;this.timer=this.between(.5,1.6);}
      else if(this.random()<.8){this.phase='bite';this.timer=.6+this.quality*.4;}
      else this.wait();
    }else if(this.phase==='bite'){this.missedBites++;this.wait();this.reason='The bite was missed. A new fish is approaching.';}
  }
}

export interface CatchCandidate { id:string; weight:number; min:number; max:number;junk?:boolean }
export function selectCatch(pool:CatchCandidate[],random:()=>number=Math.random){
  const available=pool.filter(f=>f.weight>0);if(!available.length)throw new Error('No fish available in this water');
  let roll=random()*available.reduce((sum,f)=>sum+f.weight,0);let selected=available[available.length-1];
  for(const candidate of available){roll-=candidate.weight;if(roll<=0){selected=candidate;break;}}
  const fraction=Math.pow(random(),2.4);
  return {id:selected.id,size:Math.round(selected.min+(selected.max-selected.min)*fraction),huge:!selected.junk&&fraction>.82};
}
