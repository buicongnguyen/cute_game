/**
 * A compact, bounded record of one hooked fish. Times are seconds from the start request. Each line strain (fishing.ts
 * STRAIN) is a sample flagged `strain` at tension 1, kept through thinning: the server rolls the same lineRoll for each
 * from the ticket's seed and refuses a catch whose line should have snapped.
 */
export interface ReelSample { t:number; held:boolean; tension:number; progress:number; strain?:true }
export class FishingProof {
  samples:ReelSample[]=[]; hookAt:number|null=null; strains=0; private cadence=.1;
  readonly startedAt:number;
  constructor(startedAt:number){this.startedAt=startedAt;}
  /** The line strained (and held) at `now`. */
  strain(now:number,progress:number){
    const t=Math.max(0,(now-this.startedAt)/1000);if(this.hookAt===null)this.hookAt=t;
    this.samples.push({t,held:true,tension:1,progress:Math.max(0,Math.min(1,progress)),strain:true});this.strains++;this.trim();
  }
  sample(now:number,held:boolean,tension:number,progress:number,finished=false){
    const t=Math.max(0,(now-this.startedAt)/1000);if(this.hookAt===null)this.hookAt=t;
    const last=this.samples.at(-1),value={t,held,tension:Math.max(0,Math.min(1,tension)),progress:Math.max(0,Math.min(1,progress))};
    if(last&&last.held!==held)this.samples.push({...value,held:last.held});
    if(!last||last.held!==held||t-last.t>=this.cadence||finished)this.samples.push(value);
    this.trim();
  }
  private trim(){
    if(this.samples.length<=94)return;
    // Keep endpoints, strains and every input transition; thin only equal-input intervals.
    const source=this.samples;this.samples=source.filter((v,i)=>i===0||i===source.length-1||v.strain||v.held!==source[i-1].held||v.held!==source[i+1]?.held||i%2===0);this.cadence*=2;
    // Rapid input changes cannot grow a request without bound. Oldest detail is discarded first (strains stay).
    while(this.samples.length>94){const i=this.samples.findIndex((v,k)=>k>0&&k<this.samples.length-1&&!v.strain);if(i<0)break;this.samples.splice(i,1);}
  }
  finish(now:number){return {samples:this.samples,hookAt:this.hookAt??0,elapsed:Math.max(0,(now-this.startedAt)/1000),strains:this.strains};}
}
