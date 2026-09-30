import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Templates never enter a scene. Each decoration owns its cloned palette so
// disposing or recoloring one placed object cannot invalidate another one.
const materialTemplates=new Map<string,T.MeshStandardMaterial>();
function materialTemplate(color:string,glow=0,opacity=1){
  const key=`${color}:${glow}:${opacity}`;let material=materialTemplates.get(key);
  if(!material){material=new T.MeshStandardMaterial({color,roughness:.78,metalness:.04,emissive:glow?color:'#000000',emissiveIntensity:glow,transparent:opacity<1,opacity,depthWrite:opacity===1,side:opacity<1?T.DoubleSide:T.FrontSide});materialTemplates.set(key,material);}return material;
}
type Vec=[number,number,number];
class Sculptor {
  root=new T.Group();private palette=new Map<string,T.MeshStandardMaterial>();
  material(color:string,glow=0,opacity=1){const key=`${color}:${glow}:${opacity}`;let material=this.palette.get(key);if(!material){material=materialTemplate(color,glow,opacity).clone();this.palette.set(key,material);}return material;}
  mesh(geometry:T.BufferGeometry,color:string,position:Vec=[0,0,0],parent:T.Object3D=this.root,glow=0,opacity=1){const mesh=new T.Mesh(geometry,this.material(color,glow,opacity));mesh.position.set(...position);mesh.castShadow=opacity===1;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  box(color:string,size:Vec,position:Vec,parent:T.Object3D=this.root,soft=false){return this.mesh(soft?new RoundedBoxGeometry(...size,2,Math.min(...size)*.18):new T.BoxGeometry(...size),color,position,parent);}
  ball(color:string,radius:number,position:Vec,scale:Vec=[1,1,1],parent:T.Object3D=this.root,glow=0){const ball=this.mesh(new T.SphereGeometry(radius,12,8),color,position,parent,glow);ball.scale.set(...scale);return ball;}
  cylinder(color:string,top:number,bottom:number,height:number,position:Vec,parent:T.Object3D=this.root,sides=12){return this.mesh(new T.CylinderGeometry(top,bottom,height,sides),color,position,parent);}
  rod(color:string,from:Vec,to:Vec,radius=.035,parent:T.Object3D=this.root){const a=new T.Vector3(...from),b=new T.Vector3(...to),delta=b.clone().sub(a);const rod=this.cylinder(color,radius,radius,delta.length(),a.add(b).multiplyScalar(.5).toArray() as Vec,parent,7);rod.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return rod;}
  ring(color:string,radius:number,tube:number,position:Vec,flat=false,parent:T.Object3D=this.root,arc=Math.PI*2){const ring=this.mesh(new T.TorusGeometry(radius,tube,6,24,arc),color,position,parent);if(flat)ring.rotation.x=-Math.PI/2;return ring;}
  group(position:Vec=[0,0,0],name=''){const group=new T.Group();group.position.set(...position);group.name=name;this.root.add(group);return group;}
  crystal(color:string,height:number,radius:number,position:Vec,lean=0){const group=this.group(position);group.rotation.z=lean;const low=this.cylinder(color,0,radius,height*.24,[0,height*.12,0],group,6);low.rotation.z=Math.PI;this.cylinder(color,0,radius,height*.76,[0,height*.62,0],group,6);return group;}
  star(color:string,radius:number,position:Vec,parent:T.Object3D=this.root){const shape=new T.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?radius*.43:radius;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();return this.mesh(new T.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelSize:.01,bevelThickness:.01,bevelSegments:1,steps:1}),color,position,parent);}
  eyes(x:number,y:number,z:number,gap=.18,parent:T.Object3D=this.root,color='#3e3848'){for(const side of [-1,1])this.ball(color,.045,[x+side*gap,y,z],[1,1.18,.6],parent);}
  finish(id:string){
    this.root.name=`decoration:${id}`;this.root.userData.decorationId=id;this.root.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(this.root);if(Number.isFinite(bounds.min.y))for(const child of this.root.children)child.position.y-=bounds.min.y;
    this.root.updateMatrixWorld(true);return this.root;
  }
}

const builders:Record<string,(s:Sculptor)=>void>={
  deco_volcano(s){
    s.cylinder('#7c6870',.72,.91,.16,[0,.08,0],s.root,9);
    s.cylinder('#675568',.33,.79,.96,[0,.63,0],s.root,9);
    s.ring('#9b7275',.34,.085,[0,1.13,0],true);s.cylinder('#ff9257',.28,.25,.05,[0,1.10,0],s.root,12);
    for(let i=0;i<3;i++){const a=i*2.1;const flow=s.box('#fa985f',[.12,.7,.045],[Math.sin(a)*.39,.79,Math.cos(a)*.39]);flow.rotation.y=a;flow.rotation.z=i===1?.17:-.1;}
    for(let i=0;i<4;i++)s.ball(i%2?'#ffba68':'#ee805d',.08+i*.018,[Math.sin(i*2)*.16,1.29+i*.19,Math.cos(i*2)*.1],[.9,1.3,.9],s.root,.25);
    s.root.userData.feature='crater-and-lava';
  },
  deco_lamp(s){
    s.cylinder('#776780',.29,.34,.18,[0,.09,0]);s.cylinder('#a08688',.14,.25,.2,[0,.28,0]);
    s.mesh(new T.CylinderGeometry(.19,.25,1.05,14),'#f6c899',[0,.91,0],s.root,0,.19);
    for(let i=0;i<5;i++)s.ball(i%2?'#ffb953':'#ee7968',.095,[Math.sin(i*2.4)*.09,.5+i*.18,Math.cos(i*2.4)*.08],[1,1.4,1],s.root,.28);
    s.cylinder('#887389',.11,.2,.2,[0,1.54,0]);s.cylinder('#c7ad98',.12,.13,.055,[0,1.68,0]);
    s.root.userData.feature='glass-lava-lamp';
  },
  deco_table(s){
    s.cylinder('#656073',.65,.65,.14,[0,.92,0],s.root,7);s.cylinder('#9a889d',.67,.67,.045,[0,1.01,0],s.root,7);
    for(const x of [-.4,.4])for(const z of [-.34,.34])s.rod('#504d60',[x,.08,z],[x*.8,.91,z*.8],.08);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3,chair=s.group([Math.sin(a)*.92,0,Math.cos(a)*.92]);chair.rotation.y=a;s.box('#777084',[.48,.12,.44],[0,.5,0],chair,true);s.box('#97849e',[.48,.5,.1],[0,.81,.18],chair,true);for(const x of [-.17,.17])for(const z of [-.14,.14])s.rod('#5c546d',[x,.04,z],[x,.46,z],.045,chair);}
    s.cylinder('#b9c4a7',.16,.13,.1,[.16,1.09,.08]);s.ball('#ebc181',.10,[.16,1.21,.08]);
  },
  deco_statue(s){
    s.cylinder('#918799',.65,.75,.2,[0,.1,0],s.root,7);
    for(const x of [-.22,.22])s.box('#757684',[.3,.28,.43],[x,.34,.07],s.root,true);
    const body=s.mesh(new T.IcosahedronGeometry(.57,0),'#96959d',[0,.89,0]);body.scale.set(.9,1.1,.68);
    for(const side of [-1,1]){s.ball('#777684',.25,[side*.52,1.05,0],[1,1.15,.85]);s.box('#a2a1ab',[.28,.38,.32],[side*.58,.71,.08],s.root,true);}
    s.box('#aaa8ae',[.65,.48,.5],[0,1.47,.015],s.root,true);s.eyes(0,1.49,.28,.16,s.root,'#edac74');
    const rune=s.box('#9cd5c3',[.19,.19,.03],[0,.99,.41]);rune.rotation.z=Math.PI/4;
    s.box('#6d6a7d',[.27,.045,.025],[0,1.30,.28]);
  },
  deco_nest(s){
    s.cylinder('#6f5147',.6,.55,.12,[0,.08,0]);s.ring('#ac8661',.53,.11,[0,.18,0],true);
    for(let i=0;i<12;i++){const a=i*Math.PI/6,b=a+.65;s.rod(i%2?'#bf9a68':'#967054',[Math.sin(a)*.68,.11,Math.cos(a)*.68],[Math.sin(b)*.57,.25,Math.cos(b)*.57],.045);}
    for(const[x,z,r]of [[-.23,.02,.22],[.23,-.07,.25],[0,.24,.27]]){s.ball('#bfd7b8',r,[x,.44,z],[.86,1.3,.86]);s.ball('#95b4a0',r*.19,[x+r*.34,.53,z+r*.7],[1,.7,.25]);}
    s.rod('#8c9e83',[-.08,.54,.45],[.03,.6,.45],.017);s.rod('#8c9e83',[.03,.6,.45],[-.01,.69,.44],.017);
  },
  deco_trophy(s){
    s.cylinder('#807188',.58,.66,.2,[0,.1,0],s.root,8);s.cylinder('#d7b573',.41,.49,.1,[0,.25,0]);s.cylinder('#e4c37d',.13,.22,.45,[0,.49,0]);
    s.ball('#d8b276',.46,[0,1.02,0],[1.03,.84,.85]);s.box('#e6c58c',[.6,.29,.54],[0,.94,.41],s.root,true);
    s.eyes(0,1.15,.33,.25);for(const side of [-1,1]){const horn=s.cylinder('#fff0bc',0,.12,.5,[side*.35,1.42,-.05],s.root,6);horn.rotation.z=-side*.3;s.ball('#7e6470',.04,[side*.16,1.04,.695]);}
    s.box('#a8835a',[.22,.13,.03],[0,.12,.655]);s.star('#f8db85',.11,[0,.13,.68]);
    for(const side of [-1,1]){const fin=s.mesh(new T.ConeGeometry(.27,.53,3),'#bf975f',[side*.53,1.11,-.13]);fin.rotation.z=-side*Math.PI/3;}
  },
  deco_teddy(s){
    s.ball('#ba8a65',.51,[0,.83,0],[1,1.16,.82]);s.ball('#e4c6a0',.35,[0,.8,.39],[.88,1.03,.32]);
    s.ball('#c99b72',.49,[0,1.52,.025]);for(const side of [-1,1]){s.ball('#c49670',.22,[side*.38,1.91,.02]);s.ball('#e3b7a1',.13,[side*.38,1.93,.16],[1,1,.35]);s.ball('#b78460',.25,[side*.46,.86,.04],[.85,1.22,.9]);s.ball('#b58363',.28,[side*.28,.25,.28],[1,.72,1.25]);s.ball('#e8c6a0',.18,[side*.28,.27,.5],[1,.72,.3]);}
    s.ball('#ead3b2',.22,[0,1.41,.42],[1.2,.82,.55]);s.ball('#5d4a4b',.073,[0,1.46,.553],[1,.75,.45]);s.eyes(0,1.61,.44,.19);
    for(const side of [-1,1]){const bow=s.mesh(new T.ConeGeometry(.15,.22,3),'#c97888',[side*.12,1.13,.45]);bow.rotation.z=side*Math.PI/2;}s.ball('#e19aaa',.07,[0,1.13,.49]);
    s.rod('#ae9377',[-.055,.8,.515],[.055,.7,.515],.013);s.rod('#ae9377',[.055,.8,.515],[-.055,.7,.515],.013);
  },
  deco_musicbox(s){
    s.cylinder('#af839e',.6,.63,.32,[0,.22,0],s.root,10);s.cylinder('#e8baaa',.62,.62,.075,[0,.42,0],s.root,10);s.cylinder('#eedac0',.51,.51,.04,[0,.48,0]);
    s.ring('#d6b783',.53,.045,[0,1.02,-.47]);s.mesh(new T.CircleGeometry(.5,24),'#a9cbd1',[0,1.02,-.49]);s.ring('#ead1ac',.6,.027,[0,.25,0],true);
    const dancer=s.group([0,.5,0],'musicbox-dancer');s.cylinder('#d7c39e',.04,.05,.24,[0,.12,0],dancer);s.cylinder('#c693bf',.03,.26,.23,[0,.35,0],dancer);s.cylinder('#c99ac9',.1,.08,.21,[0,.52,0],dancer);s.ball('#edcdb6',.14,[0,.72,0], [1,1,1],dancer);s.ball('#956884',.075,[0,.82,-.06],[1,1,1],dancer);
    s.rod('#ebc6b0',[-.075,.57,0],[-.29,.67,.04],.03,dancer);s.rod('#ebc6b0',[.075,.57,0],[.20,.85,0],.03,dancer);
    s.rod('#c0a276',[.61,.23,0],[.8,.23,0],.04);s.ring('#ceb182',.08,.025,[.81,.23,0]);
  },
  deco_traincar(s){
    s.box('#bd7466',[1.05,.18,1.65],[0,.39,0],s.root,true);s.box('#759cac',[.91,.75,.67],[0,.89,-.45],s.root,true);s.box('#dcbf7f',[1.12,.13,.83],[0,1.31,-.46],s.root,true);
    const boiler=s.cylinder('#709bad',.34,.34,.95,[0,.75,.35]);boiler.rotation.x=Math.PI/2;s.ring('#e9c485',.28,.05,[0,.75,.84]);s.cylinder('#756977',.15,.11,.48,[0,1.17,.56]);s.cylinder('#99808c',.2,.14,.14,[0,1.48,.56]);
    for(const side of [-1,1]){s.box('#cfeced',[.025,.29,.37],[side*.47,1.01,-.47]);for(const z of [-.61,0,.61]){const wheel=s.cylinder('#636170',.23,.23,.15,[side*.56,.28,z]);wheel.rotation.z=Math.PI/2;s.ball('#d7be86',.065,[side*.65,.28,z],[.4,1,1]);}}
    s.box('#c99378',[.87,.17,.22],[0,.37,.96],s.root,true);for(let i=0;i<3;i++)s.ball('#e4d4c8',.13+i*.035,[.055*i,1.75+i*.23,.56-i*.045],[1,.9,1]);
  },
  deco_totem(s){
    s.cylinder('#806a54',.45,.53,.2,[0,.1,0],s.root,9);
    for(let i=0;i<3;i++){const y=.48+i*.53,color=['#b87c65','#7fa49a','#c9ae74'][i];s.box(color,[.6,.49,.43],[0,y,0],s.root,true);s.eyes(0,y+.04,.235,.16);s.box('#e4d5b0',[.21,.085,.045],[0,y-.11,.247]);for(const side of [-1,1])s.box('#886453',[.17,.13,.055],[side*.2,y+.15,.24]);}
    for(const side of [-1,1]){const wing=s.box('#947565',[.6,.15,.22],[side*.54,1.55,0]);wing.rotation.z=side*.14;s.box('#c29173',[.13,.27,.25],[side*.72,1.56,.015]);}
    for(let i=-1;i<=1;i++){const leaf=s.ball('#75a886',.21,[i*.19,1.98,0],[.5,1.45,.24]);leaf.rotation.z=-i*.4;}
  },
  deco_rafflesia(s){
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5,g=s.group();g.rotation.y=a;s.ball('#719267',.55,[0,.1,.55],[.65,.18,1.25],g);s.ball(i%2?'#c97879':'#d98c84',.57,[0,.27,.57],[.68,.22,1],g);for(const[x,z]of [[-.16,.54],[.13,.67],[0,.9]])s.ball('#f1d3b1',.045,[x,.395,z],[1,.35,1],g);}
    s.cylinder('#aa6670',.34,.29,.26,[0,.25,0]);s.ring('#e1a596',.34,.095,[0,.40,0],true);s.cylinder('#775261',.25,.27,.035,[0,.39,0]);for(let i=0;i<7;i++){const a=i*.9;s.cylinder('#e7c097',.025,.04,.16,[Math.sin(a)*.16,.48,Math.cos(a)*.16],s.root,6);}
  },
  deco_fruittree(s){
    s.cylinder('#91a774',.53,.62,.12,[0,.06,0],s.root,9);s.cylinder('#a9815e',.14,.26,1.5,[0,.82,0],s.root,9);
    for(const side of [-1,1])s.rod('#ab8565',[0,1.05,0],[side*.5,1.63,.08],.08);
    s.ball('#92ba7b',.76,[0,1.98,0],[1.05,.92,.94]);s.ball('#80a76f',.52,[-.58,1.76,.08]);s.ball('#a5c785',.54,[.53,1.88,.08]);
    for(let i=0;i<7;i++){const a=i*2.39,r=.59;s.ball(i%2?'#e4af62':'#e39870',.14,[Math.sin(a)*r,1.62+(i%3)*.24,Math.cos(a)*r]);}
    s.ball('#d6ae86',.17,[.07,.4,.22],[.7,1,.2]);
  },
  deco_aquarium(s){
    s.box('#b59479',[1.8,.2,1.15],[0,.13,0],s.root,true);s.box('#cdd5c4',[1.62,.09,1],[0,.28,0]);
    s.mesh(new T.BoxGeometry(1.62,1.02,1),'#a7d8de',[0,.83,0],s.root,0,.15);s.box('#d5c3a5',[1.77,.09,1.12],[0,1.39,0]);
    for(const x of [-.82,.82])for(const z of [-.51,.51])s.rod('#a9bec0',[x,.27,z],[x,1.38,z],.025);
    for(const[x,color]of [[-.44,'#75a790'],[.52,'#9ab27e']] as const)for(let j=-1;j<=1;j++){s.rod(color,[x,.3,-.25],[x+j*.12,.68+Math.abs(j)*.12,-.24],.025);const leaf=s.ball(color,.19,[x+j*.1,.58,-.25],[.25,1,.55]);leaf.rotation.z=-j*.4;}
    for(const[x,y,z,color,dir]of [[-.3,.91,.12,'#e9b664',1],[.38,.66,.16,'#d7a3b8',-1]] as const){const fish=s.group([x,y,z]);fish.rotation.y=dir<0?Math.PI:0;s.ball(color,.19,[0,0,0],[1.4,.7,.48],fish);const tail=s.mesh(new T.ConeGeometry(.14,.22,3),color,[-.3,0,0],fish);tail.rotation.z=-Math.PI/2;s.ball('#515360',.026,[.14,.035,.084],[1,1,.35],fish);}
    for(let i=0;i<4;i++)s.ball('#c9eced',.027+i*.006,[.1+Math.sin(i)*.045,.6+i*.18,.27],[1,1,1],s.root,.1);
  },
  deco_shell(s){
    const shape=new T.Shape();shape.moveTo(0,.06);for(let i=0;i<=18;i++){const a=i*Math.PI/18,r=i%2?.86:.91;shape.lineTo(Math.cos(a)*r,.19+Math.sin(a)*r);}shape.closePath();
    s.mesh(new T.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelSegments:2,bevelSize:.04,bevelThickness:.04,steps:1}),'#e5c5bf',[0,0,-.1]);
    for(let i=0;i<=8;i++){const a=i*Math.PI/8;s.rod('#f3dfca',[0,.15,.13],[Math.cos(a)*.84,.19+Math.sin(a)*.84,.13],.025);}
    s.ball('#eee2cc',.25,[0,.27,.31]);s.ball('#f6f0df',.065,[-.07,.37,.49],[1,1,.25]);s.cylinder('#c5b8a3',.54,.59,.11,[0,.06,.03]);
  },
  deco_piratechest(s){
    s.box('#a88565',[1.22,.61,.83],[0,.37,0],s.root,true);s.box('#594e5b',[1.06,.035,.68],[0,.70,0]);
    for(const x of [-.44,.44])s.box('#d6b576',[.11,.65,.87],[x,.38,0],s.root,true);
    const lid=s.group([0,.69,-.43],'treasure-lid');lid.rotation.x=-.55;s.box('#b58c67',[1.25,.28,.85],[0,.14,.42],lid,true);for(const x of [-.44,.44])s.box('#e1bf7b',[.1,.31,.87],[x,.15,.42],lid,true);
    for(let i=0;i<8;i++){const a=i*2.4;s.cylinder(i%2?'#e9ca78':'#d5ad61',.12,.12,.045,[Math.sin(a)*.36,.74+(i%3)*.025,Math.cos(a)*.2]);}
    s.crystal('#8ac5b7',.25,.11,[.26,.74,.02],-.25);s.crystal('#c3a3cf',.19,.09,[-.25,.73,.1],.35);s.box('#e4c47b',[.19,.24,.075],[0,.43,.47],s.root,true);s.ball('#76584f',.035,[0,.43,.514],[1,1.2,.2]);
  },
  deco_cloudsofa(s){
    for(const x of [-.55,.55])for(const z of [-.27,.27])s.cylinder('#d7bd8b',.07,.09,.18,[x,.12,z]);
    s.box('#b4cbd6',[1.5,.36,.92],[0,.38,0],s.root,true);
    for(const x of [-.4,0,.4])s.ball('#e4edf0',.38,[x,.99,-.33],[1.06,.95,.56]);
    for(const side of [-1,1])s.ball('#e9eff0',.31,[side*.8,.65,0],[.68,1.22,1.45]);
    for(const x of [-.34,.34])s.box('#dce8eb',[.67,.19,.7],[x,.64,.07],s.root,true);
    const pillow=s.box('#c5b5cd',[.42,.4,.15],[.36,.9,-.04],s.root,true);pillow.rotation.z=-.15;s.star('#ead49d',.08,[.34,.92,.055]);
  },
  deco_windchime(s){
    s.cylinder('#9c8d83',.31,.4,.13,[-.54,.08,0]);s.rod('#a4917e',[-.54,.1,0],[-.54,2.03,0],.045);s.rod('#a4917e',[-.54,2.03,0],[.28,2.03,0],.045);s.rod('#c5b492',[.06,2.03,0],[.06,1.8,0],.013);
    s.cylinder('#d3b98a',.37,.37,.08,[.06,1.79,0]);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=.06+Math.sin(a)*.27,z=Math.cos(a)*.27,h=.34+i%3*.1;s.rod('#d8c9b3',[x,1.75,z],[x,1.32-h,z],.009);s.crystal(['#9ecbd3','#bcafd5','#acd5c4'][i%3],h,.07,[x,1.2-h,z]);}
    s.rod('#c8bca7',[.06,1.71,0],[.06,.57,0],.009);s.star('#e3c791',.14,[.06,.41,0]);
  },
  deco_rainbow(s){
    const colors=['#dd979d','#e6b184','#dfcf8b','#98b895','#95bdcb','#b6a9cf'];
    colors.forEach((color,i)=>s.ring(color,1.03-i*.071,.045,[0,.27,0],false,s.root,Math.PI));
    for(const side of [-1,1])for(let i=0;i<3;i++)s.ball('#ebefed',.21,[side*(.82+i*.13),.19+(i===1?.08:0),.02],[1.05,.76,.83]);
  },
  deco_ghostlantern(s){
    s.cylinder('#83788e',.3,.38,.13,[0,.075,0],s.root,9);s.cylinder('#786b87',.12,.19,.35,[0,.31,0]);
    s.cylinder('#7e7290',.42,.34,.15,[0,.60,0],s.root,8);s.cylinder('#a094ad',.36,.44,.13,[0,1.51,0],s.root,8);
    for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;s.rod('#897b98',[Math.sin(a)*.34,.63,Math.cos(a)*.34],[Math.sin(a)*.34,1.47,Math.cos(a)*.34],.035);}
    s.cylinder('#8d7e9a',0,.40,.35,[0,1.73,0],s.root,8);s.ring('#9c8ba4',.11,.026,[0,2.02,0]);
    s.ball('#bce4d1',.26,[0,1.12,0],[.88,1.13,.83],s.root,.3);s.cylinder('#c4ead8',.19,.28,.29,[0,.86,0],s.root,8);s.eyes(0,1.17,.221,.083,s.root,'#5e7f82');s.ball('#d4f1dc',.075,[0,.78,.18],[1,.7,.55],s.root,.2);
  },
  deco_nightcrystal(s){
    s.cylinder('#827a94',.61,.72,.17,[0,.1,0],s.root,7);s.ring('#bab0d0',.57,.025,[0,.20,0],true);
    s.crystal('#b4a2ce',1.45,.28,[0,.19,0],-.06);s.crystal('#938cb9',.94,.22,[-.37,.2,.04],.28);s.crystal('#8caac3',.77,.18,[.37,.2,.08],-.32);
    const moon=s.ring('#e2d2a2',.20,.055,[.07,1.21,.29],false,s.root,Math.PI*1.55);moon.rotation.z=.32;s.star('#e9dbb4',.085,[-.36,.8,.26]);s.star('#d0e2e8',.075,[.41,.6,.26]);
  },
  deco_owlstatue(s){
    s.cylinder('#a3a49b',.50,.58,.18,[0,.1,0],s.root,8);s.ball('#a6afa6',.43,[0,.72,0],[.88,1.2,.72]);s.ball('#c3c5b4',.43,[0,1.29,0],[1.07,.83,.85]);
    for(const side of [-1,1]){s.ball('#dcd9c0',.20,[side*.2,1.34,.3],[1,1.06,.26]);s.ball('#887d66',.085,[side*.2,1.35,.355],[1,1.1,.32]);s.ball('#4e5360',.045,[side*.2,1.35,.386],[1,1.1,.25]);const ear=s.cylinder('#aeb7ad',0,.15,.37,[side*.29,1.63,-.015],s.root,5);ear.rotation.z=-side*.25;const wing=s.ball('#859890',.26,[side*.32,.75,.065],[.45,1.36,.52]);wing.rotation.z=-side*.25;}
    const beak=s.cylinder('#c9ad7c',0,.095,.19,[0,1.15,.38],s.root,5);beak.rotation.x=Math.PI/2;
    for(let row=0;row<3;row++)for(const x of [-.1,.1]){s.rod('#d5d2bc',[x-.045,.92-row*.14,.3],[x,.875-row*.14,.32],.014);s.rod('#d5d2bc',[x,.875-row*.14,.32],[x+.045,.92-row*.14,.3],.014);}
    for(const x of [-.14,.14])s.ball('#c6b391',.1,[x,.28,.21],[1,.5,1.3]);
  },
};

/** All models face +Z, stand on Y=0 and own their disposable resources. */
export function buildDecoration(id:string):T.Group{
  const sculptor=new Sculptor();const builder=Object.hasOwn(builders,id)?builders[id]:undefined;
  if(builder)builder(sculptor);
  else{sculptor.root.userData.fallback=true;sculptor.cylinder('#bb927b',.36,.28,.45,[0,.24,0]);sculptor.ball('#91b58b',.35,[0,.66,0]);}
  return sculptor.finish(id);
}

