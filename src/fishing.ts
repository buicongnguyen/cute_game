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
   * A steady rod (rod_steady): tension builds slower and heavy fish slow the reel less (STEADY), and the bite
   * window is 0.4 s longer; the line can still snap. Still interactive: you must hook at the bite, and 7 s of slack still loses the fish.
   */
  steady?:boolean;
  /** True while the bag holds a worm. */
  bait:boolean;
  /** Chance the line snaps each time it strains (tension reaches 1); default from the rod (lineBreakChance). */
  breakChance?:number;
  /** Seed of the strain rolls (lineRoll; online the server's fishStart ticket, so its proof check rolls the same). Unset: `random` rolls. */
  lineSeed?:number;
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

/**
 * Fish swimming in each kind of water: twice the reference's counts (Lh @861404: home 4, lake 9 …) since the user asked for
 * ponds full of fish (round 26). Rod and harpoon share one stock per pond (fish-hunting.ts slots). Drawn instanced
 * (fishing-view.ts), so a fuller pond costs no more draw calls. A rod catch is replaced RESTOCK_AFTER_CATCH s later
 * (the reference: 12 s; the user: "a few seconds", exploiting by fishing is fine), a lost fish after RESTOCK_AFTER_LOSS s.
 */
export const FISH_PER_WATER:Record<string,number>={home:8,lake:18,swamp:8,candy:12,ice:12,lava:0,toy:10,jungle:10,ocean:14,dark:10,shadow:10};
export const RESTOCK_AFTER_CATCH=3, RESTOCK_AFTER_LOSS=4;

/**
 * Line strain (round 26, the user's numbers): when the tension bar fills (the fish surged while Reel was held), the line
 * strains and snaps with the rod's chance: bamboo 60 %, golden 30 %, steady 10 %. A line that holds gives a little:
 * tension drops back to STRAIN.relief and the fish takes STRAIN.slip of the line. Above STRAIN.warn the game warns
 * "Line strained! Let go!" first, so every roll is announced and avoidable (let go and tension falls 0.9 a second).
 */
export const LINE_BREAK={bamboo:.6,golden:.3,steady:.1} as const;
export const STRAIN={warn:.8,relief:.7,slip:.08} as const;
/** The chance a rod's line snaps on each strain: steady rods 10 %, rods of quality 0.7+ (golden) 30 %, others (bamboo) 60 %. */
export function lineBreakChance(rod:{quality?:number;steady?:boolean}|undefined){return rod?.steady?LINE_BREAK.steady:(rod?.quality??0)>=.7?LINE_BREAK.golden:LINE_BREAK.bamboo;}
/** The roll for strain `index` of a fight seeded `seed`, in [0, 1): a hash, so the client and the server's proof check agree. */
export function lineRoll(seed:number,index:number){
  let n=Math.imul((seed>>>0)^0x9e3779b9,0x85ebca6b)^Math.imul(index+1,0xc2b2ae35);n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);
  return ((n^(n>>>16))>>>0)/4294967296;
}
export const lineSnaps=(seed:number,index:number,chance:number)=>lineRoll(seed,index)<chance;

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
 * The steady rod's numbers (toned down in wave 9). Heavy fish count as 60 % as heavy; reeling is 1.2x and still 0.5x (not
 * 0.2x) during a surge; tension builds at 0.6x. The line strains at 1.0 like any other (a 10 % snap, LINE_BREAK), so holding
 * Reel through every surge can still lose a heavy fish, while letting go during surges lands it.
 */
export const STEADY={bite:.4,heavy:.6,reel:1.2,surge:.5,tension:.6} as const;

export class FishingSimulation<P extends FishPick=FishPick> {
  phase:FishingPhase='cast'; tension=0; progress=0; time=0; surge=0;
  /** The fish now coming or on the line. */
  pick:P|null=null;
  /** Distance of the approaching fish from the bobber, and the nibble dart (0.3 s → 0) the view draws. */
  fishDistance=0; dart=0;
  /** Event counters the game and the view react to. */
  nibbles=0; missedBites=0; earlyPresses=0; fled=0; baitUsed=0; approaches=0;
  /** Line strains rolled this cast (each one a lineRoll by index) and how many the line survived. */
  strains=0; strainsHeld=0;
  readonly breakChance:number; lineSeed:number|null;
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
    this.breakChance=Math.max(0,Math.min(1,options.breakChance??lineBreakChance({quality:options.quality,steady:options.steady})));
    this.lineSeed=options.lineSeed===undefined?null:options.lineSeed>>>0;
  }
  private between(min:number,max:number){return min+this.random()*(max-min);}
  get fighting(){return this.phase==='hooked';}
  get finished(){return this.phase==='caught'||this.phase==='escaped';}
  get snapped(){return this.phase==='escaped'&&this.reason.includes('snapped');}
  /** The tension bar is near full while hooked: the next strain may snap the line. */
  get strained(){return this.phase==='hooked'&&this.tension>=STRAIN.warn;}
  /** The server's seed arrives with the fish (fishStart), before it can be hooked. */
  setLineSeed(seed:number){if(Number.isFinite(seed))this.lineSeed=seed>>>0;}
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
      this.tension+=dt*(1.2-q*.45)*(.08+(surging?.6*p+.12:.02))*(this.steady?STEADY.tension:1);
      this.slack=0;
    }else{this.tension-=dt*.9;this.progress-=dt*.05*p*(surging?2.5:1);this.slack+=dt;}
    this.tension=Math.max(0,this.tension);this.progress=Math.max(0,this.progress);
    if(this.tension>=1){
      const index=this.strains++;
      if(this.lineSeed===null?this.random()<this.breakChance:lineSnaps(this.lineSeed,index,this.breakChance)){this.snap();return;}
      this.strainsHeld++;this.tension=STRAIN.relief;this.progress=Math.max(0,this.progress-STRAIN.slip);
    }
    if(this.slack>7){this.useBait();this.phase='escaped';this.reason='The line went slack and the fish slipped away.';return;}
    if(this.progress>=1){this.progress=1;this.useBait();this.phase='caught';this.reason='A lovely catch!';}
  }
  private snap(){this.tension=Math.max(this.tension,1);this.useBait();this.phase='escaped';this.reason='The line snapped. Let go of Reel when the fish surges.';}
}

export interface CatchCandidate { id:string; weight:number; min:number; max:number;junk?:boolean }
export const MYSTERY_TREASURE_WEIGHTS:readonly (readonly [string,number])[]=[['starshard',3],['pearl',3],['amber',3],['moonstone',2],['thunderstone',2],['seed_star',2],['crown',1],['fish_golden',1],['deco_piratechest',1]];
/**
 * The mystery shadow (reference F-026): it is never placed at load and does not wait in a pond on a timer. It is called
 * only while the explorer is fishing: at each attract (a fish setting off for the bobber), when no mystery is already
 * within `reach` of the bobber, there is a `call` (10 %) chance one rises `near` (2.5–3.2 m) from the bobber, at most
 * once per `cooldownMs` (60 s) per explorer. It is then the fish that comes; a miss (bite missed, too early, it swam
 * off, or the cast was ended) brings it back up to `tries` (3) attempts in all, after which it sinks away.
 * `chance` is the share of supergiant fish among mystery catches (resolveMysteryCatch). The browser offline and the
 * server online run the same caller (attractMystery and friends) on their own state.
 */
export const MYSTERY={chance:.6,reach:3.5,call:.1,cooldownMs:60_000,near:[2.5,3.2],tries:3} as const;
/** One explorer's mystery state: when one was last called, and the one now waiting (water key, spot, attempts used). */
export interface MysteryCaller { lastCallAt:number; active?:{ water:string; x:number; z:number; tries:number } }
export const newMysteryCaller=():MysteryCaller=>({lastCallAt:0});
/** A spot 2.5–3.2 m from the bobber, kept inside the water when the pond is known (tries a few directions, then pulls it in). */
export function mysterySpot(cast:Point,random:()=>number=Math.random,water?:Water):Point{
  const [lo,hi]=MYSTERY.near,d=lo+random()*(hi-lo),a0=random()*Math.PI*2;
  for(let i=0;i<8;i++){const a=a0+i*Math.PI/4,p={x:cast.x+Math.cos(a)*d,z:cast.z+Math.sin(a)*d};if(!water||Math.hypot(p.x-water.x,p.z-water.z)<=water.r-.4)return p;}
  const a=a0,p={x:cast.x+Math.cos(a)*d,z:cast.z+Math.sin(a)*d};if(!water)return p;
  const from=Math.hypot(p.x-water.x,p.z-water.z)||1,inner=Math.max(.2,water.r-.4);return {x:water.x+(p.x-water.x)/from*inner,z:water.z+(p.z-water.z)/from*inner};
}
/**
 * One attract: whether the coming fish is the mystery. A mystery already waiting in this water within reach of the bobber
 * comes again; one left elsewhere (another pond, far from this cast) is gone. Otherwise a new one may be called.
 * `now` in ms. Mutates `st`.
 */
export function attractMystery(st:MysteryCaller,water:string,cast:Point,now:number,random:()=>number=Math.random,pond?:Water):{mystery:boolean;called:boolean;spot?:Point}{
  const active=st.active;
  if(active&&active.water===water&&Math.hypot(active.x-cast.x,active.z-cast.z)<=MYSTERY.reach)return {mystery:true,called:false,spot:{x:active.x,z:active.z}};
  if(active)delete st.active;
  if(!(now-st.lastCallAt>=MYSTERY.cooldownMs)||!(random()<MYSTERY.call))return {mystery:false,called:false};
  const spot=mysterySpot(cast,random,pond);st.lastCallAt=now;st.active={water,x:spot.x,z:spot.z,tries:0};
  return {mystery:true,called:true,spot};
}
/** The mystery got away (or the cast ended before it was landed): true when that was its last try and it is gone. */
export function mysteryMissed(st:MysteryCaller):boolean{if(!st.active)return true;st.active.tries++;if(st.active.tries>=MYSTERY.tries){delete st.active;return true;}return false;}
/** The mystery was landed: it is gone (the 60 s wait counts from when it was called). */
export function mysteryLanded(st:MysteryCaller){delete st.active;}
/** A saved caller (server account record), checked; anything malformed starts fresh. */
export function parseMysteryCaller(raw:unknown):MysteryCaller{
  const v=raw&&typeof raw==='object'?raw as Record<string,unknown>:{},st:MysteryCaller={lastCallAt:Number.isFinite(v.lastCallAt)?v.lastCallAt as number:0};
  const a=v.active&&typeof v.active==='object'?v.active as Record<string,unknown>:null;
  if(a&&typeof a.water==='string'&&Number.isFinite(a.x)&&Number.isFinite(a.z)&&Number.isSafeInteger(a.tries)&&(a.tries as number)>=0&&(a.tries as number)<MYSTERY.tries)st.active={water:a.water,x:a.x as number,z:a.z as number,tries:a.tries as number};
  return st;
}
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
