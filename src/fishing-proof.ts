/** A compact, bounded record of one hooked fish. Times are seconds from the start request. */
export interface ReelSample { t:number; held:boolean; tension:number; progress:number }
export class FishingProof {
  samples:ReelSample[]=[]; hookAt:number|null=null; private cadence=.1;
  readonly startedAt:number;
  constructor(startedAt:number){this.startedAt=startedAt;}
  sample(now:number,held:boolean,tension:number,progress:number,finished=false){
    const t=Math.max(0,(now-this.startedAt)/1000);if(this.hookAt===null)this.hookAt=t;
    const last=this.samples.at(-1),value={t,held,tension:Math.max(0,Math.min(1,tension)),progress:Math.max(0,Math.min(1,progress))};
    if(last&&last.held!==held)this.samples.push({...value,held:last.held});
    if(!last||last.held!==held||t-last.t>=this.cadence||finished)this.samples.push(value);
    if(this.samples.length>94){
      // Keep endpoints and every input transition; thin only equal-input intervals.
      const source=this.samples;this.samples=source.filter((v,i)=>i===0||i===source.length-1||v.held!==source[i-1].held||v.held!==source[i+1]?.held||i%2===0);this.cadence*=2;
      // Rapid input changes cannot grow a request without bound. Oldest detail is discarded first.
      while(this.samples.length>94)this.samples.splice(1,1);
    }
  }
  finish(now:number){return {samples:this.samples,hookAt:this.hookAt??0,elapsed:Math.max(0,(now-this.startedAt)/1000)};}
}
