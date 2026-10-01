/**
 * The reference's fishing rules (zoo-pet.store bundle, class `zh` @861404–@873700), as a pure,
 * seedable simulation. The view (fishing-view.ts) only draws what this decides.
 *
 * Phases: cast (0.5 s) → wait → approach (a fish swims to the bobber) → nibble (1–4 taps)
 * → bite (1.4 + 0.6 × rod quality s) → hooked (hold to reel against tension) → caught | escaped.
 */
export type FishingPhase = 'cast'|'wait'|'approach'|'nibble'|'bite'|'hooked'|'caught'|'escaped';
export interface Point { x:number; z:number }
/** A round body of water (the reference's waters are circles). */
export interface Water extends Point { r:number }
/** The next fish to come, chosen when it sets off toward the bobber, like the reference's attract(). */
export interface FishPick { id:string; power:number }
export interface FishingOptions<P extends FishPick=FishPick> {
  /** Rod quality: bamboo 0.3, golden 0.7, steady 0.9. */
  quality:number;
  /**
   * A steady rod (rod_steady): the line never snaps at any tension, heavy fish barely slow the reel, and the bite
   * window is 0.4 s longer. Still interactive: you must hook at the bite, and 7 s of slack still loses the fish.
   */
  steady?:boolean;
  /** True while the bag holds a worm. */
  bait:boolean;
  /** Picks the fish that comes, given the rare-fish bonus of bait, rod and luck. */
  choose:(bonus:number)=>P|null;
  /** Player luck, added to the bonus. */
  luck?:number;
  /** How far the chosen fish starts from the bobber (the view knows where its fish swim). */
  approachFrom?:(pick:P)=>number;
  /** The water, the cast point and the explorer: an early press drags the bobber 0.7 m toward the explorer. */
  water?:Water; cast?:Point; player?:Point;
  random?:()=>number;
}

/** Cast geometry from the reference's plan() @862870 and press() @864100. */
export const CAST = {
  /** The explorer stands this far outside the rim, on the side they came from. */
  shoreGap:.6,
  /** The bobber lands at least this far inside the rim. */
  edgeGap:.6,
  /** Longest and shortest cast, measured from the shore point. */
  max:7, min:1.8,
  /** An early press pulls the bobber this far toward the explorer… */
  early:.7,
  /** …and reels the line in once it is within this distance of the rim. */
  reelInGap:.3,
  /** Seconds of the cast arc, and its height. */
  flight:.5, arc:1.6,
} as const;

/** Fish swimming in each kind of water (Lh @861404); a caught fish is replaced 12 s later, another lost fish after 15 s. */
export const FISH_PER_WATER:Record<string,number>={home:4,lake:9,swamp:4,candy:6,ice:6,lava:0,toy:5,jungle:5,ocean:7,dark:5,shadow:5};
export const RESTOCK_AFTER_CATCH=12, RESTOCK_AFTER_LOSS=15;

/**
 * Where the explorer stands and where the bobber lands for a tap at `tap`: the shore point is on the rim
 * nearest the explorer; the cast point is the tap kept 0.6 m inside the rim, then pulled to within 7 m of the
 * shore point, or set 1.8 m from it toward the middle when the tap was closer than that.
 */
export function planCast(water:Water, player:Point, tap:Point){
  let dx=player.x-water.x, dz=player.z-water.z; const d=Math.hypot(dx,dz);
  if(d<.1){dx=0;dz=1;}else{dx/=d;dz/=d;}
  const shore={x:water.x+dx*(water.r+CAST.shoreGap),z:water.z+dz*(water.r+CAST.shoreGap)};
  let cast={x:tap.x,z:tap.z};const fromCentre=Math.hypot(cast.x-water.x,cast.z-water.z),inner=water.r-CAST.edgeGap;
  if(fromCentre>inner)cast={x:water.x+(cast.x-water.x)/fromCentre*inner,z:water.z+(cast.z-water.z)/fromCentre*inner};
  const reach=Math.hypot(cast.x-shore.x,cast.z-shore.z);
  if(reach>CAST.max)cast={x:shore.x+(cast.x-shore.x)*CAST.max/reach,z:shore.z+(cast.z-shore.z)*CAST.max/reach};
  if(reach<CAST.min){const k=CAST.min/(water.r+CAST.shoreGap);cast={x:shore.x+(water.x-shore.x)*k,z:shore.z+(water.z-shore.z)*k};}
  return {shore,cast};
}

/** An early press: the bobber moves 0.7 m toward the explorer; near the rim the line is reeled in. */
export function earlyPull(water:Water, cast:Point, player:Point){
  const dx=player.x-cast.x,dz=player.z-cast.z,d=Math.hypot(dx,dz)||1;
  const moved={x:cast.x+dx/d*CAST.early,z:cast.z+dz/d*CAST.early};
  return {cast:moved,reeledIn:Math.hypot(moved.x-water.x,moved.z-water.z)>water.r-CAST.reelInGap};
}

/** The rare-fish bonus at each approach (attract @868468): a worm 0.8, plus rod quality − 0.3, plus luck. */
export const catchBonus=(bait:boolean,quality:number,luck=0)=>(bait?.8:0)+quality-.3+luck;
/** A species' weight under that bonus (wp @723637): legendary × (1 + 1.5 b), rare × (1 + b). */
export const catchWeight=(weight:number,rarity:string,bonus:number)=>weight*(rarity==='legendary'?1+bonus*1.5:rarity==='rare'?1+bonus:1);

/**
 * The steady rod's numbers. Heavy fish (power up to 0.97) count as 40 % as heavy; reeling is 1.4x and still 0.5x (not
 * 0.2x) during a surge, so a whale lands in about 5 s of holding instead of a long fight with snaps.
 */
export const STEADY={bite:.4,heavy:.4,reel:1.4,surge:.5,maxTension:.95} as const;

export class FishingSimulation<P extends FishPick=FishPick> {
  phase:FishingPhase='cast'; tension=0; progress=0; time=0; surge=0;
  /** The fish now coming or on the line. */
  pick:P|null=null;
  /** Distance of the approaching fish from the bobber, and the nibble dart (0.3 s → 0) the view draws. */
  fishDistance=0; dart=0;
  /** Event counters the game and the view react to. */
  nibbles=0; missedBites=0; earlyPresses=0; fled=0; baitUsed=0; approaches=0;
  /** Where the bobber floats (an early press moves it). */
  cast:Point|null;
  reason=''; holding=false;
  private t=0; private waitT=0; private nibblesLeft=0; private nibT=0; private touched=false;
  private biteT=0; private slack=0; private surgeCd=0; private power=.2; private lastHeld=false;
  private readonly quality:number; private readonly steady:boolean; private bait:boolean; private readonly random:()=>number;
  private readonly options:FishingOptions<P>;
  constructor(options:FishingOptions<P>){
    this.options=options;
    this.quality=Math.max(0,options.quality);this.steady=options.steady===true;this.bait=options.bait;this.random=options.random??Math.random;
    this.cast=options.cast?{...options.cast}:null;this.waitT=this.nextWait();
  }
  private between(min:number,max:number){return min+this.random()*(max-min);}
  get fighting(){return this.phase==='hooked';}
  get finished(){return this.phase==='caught'||this.phase==='escaped';}
  get snapped(){return this.phase==='escaped'&&this.reason.includes('snapped');}
  /** Whether a worm is still on the hook after one was used. */
  setBait(available:boolean){this.bait=available;}
  get usingBait(){return this.bait;}
  /** Wait for the next fish (nextWait @863574): 2–5.5 s, ÷ 1.7 with a worm, ÷ (1 + quality / 2). */
  nextWait(){return this.between(2,5.5)/(this.bait?1.7:1)/(1+this.quality*.5);}
  get biteWindow(){return 1.4+this.quality*.6+(this.steady?STEADY.bite:0);}
  private useBait(){if(this.bait)this.baitUsed++;}
  private toWait(extra=0){this.phase='wait';this.t=0;this.waitT=this.nextWait()+extra;this.pick=null;this.fishDistance=0;this.dart=0;}

  press(){
    this.holding=true;
    if(this.phase==='bite'){
      this.phase='hooked';this.t=0;this.tension=.25;this.progress=.05;this.surge=0;this.surgeCd=this.between(.5,1.5);this.slack=0;
      this.power=this.pick?.power??.2;return true;
    }
    if(this.phase==='wait'||this.phase==='approach'||this.phase==='nibble'){
      this.earlyPresses++;if(this.phase!=='wait')this.fled++;
      this.toWait(1.5);this.reason='Too early: the bobber jerked and the fish swam off.';
      const {water,player}=this.options;
      if(water&&player&&this.cast){const pulled=earlyPull(water,this.cast,player);this.cast=pulled.cast;if(pulled.reeledIn){this.phase='escaped';this.reason='You reeled the line back in.';}}
    }
    return false;
  }
  release(){this.holding=false;}

  update(dt:number,held:boolean,active=true){
    if(!active||this.finished)return;
    if(held&&!this.lastHeld)this.press();else if(!held&&this.lastHeld)this.release();
    this.lastHeld=held;
    if(this.finished)return;
    this.time+=dt;this.t+=dt;
    switch(this.phase){
      case 'cast':if(this.t>=CAST.flight){this.phase='wait';this.t=0;}return;
      case 'wait':this.waitT-=dt;if(this.waitT<=0)this.attract();return;
      case 'approach':
        // The fish swims at 1.1 m/s, slowing to 0.45 m/s within 2 m, and nibbles once it is there and 0.8 s have passed.
        if(this.fishDistance>.55)this.fishDistance=Math.max(.55,this.fishDistance-dt*(this.fishDistance>2?1.1:.45));
        else if(this.t>.8){this.phase='nibble';this.t=0;this.nibT=this.between(.4,1.2);this.dart=0;}
        return;
      case 'nibble':
        this.nibT-=dt;
        if(this.nibT<=0&&this.dart<=0){this.dart=.3;this.touched=false;}
        if(this.dart>0){
          this.dart-=dt;
          if(this.dart<.15&&!this.touched){this.touched=true;this.nibbles++;}
          if(this.dart<=0){
            this.dart=0;
            if(--this.nibblesLeft>0)this.nibT=this.between(.5,1.6);
            else if(this.random()<.95){this.phase='bite';this.t=0;this.biteT=this.biteWindow;}
            else{this.fled++;this.toWait();this.reason='The fish lost interest.';}
          }
        }
        return;
      case 'bite':
        this.biteT-=dt;
        if(this.biteT<=0){this.missedBites++;this.useBait();this.fled++;this.toWait();this.reason='The bite was missed. Wait for the next fish.';}
        return;
      case 'hooked':this.reel(dt);return;
    }
  }

  /** attract(): pick the fish by the bait/rod/luck bonus and send it toward the bobber for 1–4 nibbles. */
  private attract(){
    const pick=this.options.choose(catchBonus(this.bait,this.quality,this.options.luck??0));
    if(!pick){this.waitT=.1;return;}
    this.pick=pick;this.approaches++;this.phase='approach';this.t=0;
    this.fishDistance=Math.max(.55,this.options.approachFrom?.(pick)??2.5);
    this.nibblesLeft=1+Math.floor(this.random()*4);this.dart=0;
  }

  /** Reference updateReel: hold to gain line; tension snaps it, seven seconds of slack loses it. */
  private reel(dt:number){
    const q=this.quality,p=this.steady?this.power*STEADY.heavy:this.power;
    this.surgeCd-=dt;
    if(this.surge>0)this.surge-=dt;else if(this.surgeCd<=0){this.surge=this.between(.4,.8+p);this.surgeCd=this.between(.8,2.2)*(1.2-p*.5);}
    const surging=this.surge>0;
    if(this.holding){
      this.progress+=dt*.3*(1.15-p*.45)*(surging?(this.steady?STEADY.surge:.4):1)*(this.steady?STEADY.reel:1);
      this.tension+=dt*(1.2-q*.45)*(.08+(surging?.6*p+.12:.02));
      this.slack=0;
    }else{this.tension-=dt*.9;this.progress-=dt*.05*p*(surging?2.5:1);this.slack+=dt;}
    this.tension=Math.max(0,this.tension);this.progress=Math.max(0,this.progress);
    // A steady line flexes instead of snapping: tension stops just short of the break.
    if(this.steady)this.tension=Math.min(this.tension,STEADY.maxTension);
    else if(this.tension>=1){this.snap();return;}
    if(this.slack>7){this.useBait();this.phase='escaped';this.reason='The line went slack and the fish slipped away.';return;}
    if(this.progress>=1){this.progress=1;this.useBait();this.phase='caught';this.reason='A lovely catch!';}
  }
  private snap(){this.tension=Math.max(this.tension,1);this.useBait();this.phase='escaped';this.reason='The line snapped. Let go of Reel when the fish surges.';}
}

export interface CatchCandidate { id:string; weight:number; min:number; max:number;junk?:boolean }
export const MYSTERY_TREASURE_WEIGHTS:readonly (readonly [string,number])[]=[['starshard',3],['pearl',3],['amber',3],['moonstone',2],['thunderstone',2],['seed_star',2],['crown',1],['fish_golden',1],['deco_piratechest',1]];
export const MYSTERY={chance:.6,reach:3.5,firstMin:4,firstMax:20,respawnMin:45,respawnMax:90} as const;
/** Resolve only after landing the silhouette. Server actions use the same table with server-owned randomness. */
export function resolveMysteryCatch(fish:Pick<CatchCandidate,'id'|'max'>,random:()=>number=Math.random){
  if(random()<MYSTERY.chance)return {id:fish.id,size:Math.round(fish.max*(1.6+random())),huge:true,supergiant:true,mystery:true};
  let roll=random()*MYSTERY_TREASURE_WEIGHTS.reduce((sum,[,weight])=>sum+weight,0);
  const id=MYSTERY_TREASURE_WEIGHTS.find(([,weight])=>(roll-=weight)<=0)?.[0]??'starshard';
  return {id,size:0,huge:false,supergiant:false,mystery:true};
}
export function selectCatch(pool:CatchCandidate[],random:()=>number=Math.random){
  const available=pool.filter(f=>f.weight>0);if(!available.length)throw new Error('No fish available in this water');
  let roll=random()*available.reduce((sum,f)=>sum+f.weight,0);let selected=available[available.length-1];
  for(const candidate of available){roll-=candidate.weight;if(roll<=0){selected=candidate;break;}}
  // Sizes lean small (a fraction to the power 2.4); the top 18 % are "huge" (finish @866000).
  const fraction=Math.pow(random(),2.4);
  return {id:selected.id,size:Math.round(selected.min+(selected.max-selected.min)*fraction),huge:!selected.junk&&fraction>.82};
}

/** What the view reads from a simulation, whatever its pick type. */
export type FishingState = Pick<FishingSimulation, 'phase'|'cast'|'earlyPresses'|'fled'|'missedBites'|'nibbles'|'dart'|'fishDistance'|'tension'|'surge'|'progress'>;
