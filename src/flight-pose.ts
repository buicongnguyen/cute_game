import type * as T from 'three';
import {part} from './part-cache.ts';

/** Superman glides with arms ahead and legs trailing; hovering has no walking cycle. */
export function superheroFlightPose(model:T.Object3D,moving:boolean){
  model.userData.superheroFlight=true;
  // Pitch about the avatar's local right axis, so east/west flights lean forward too.
  model.rotation.order='YXZ';model.rotation.x=moving?1.2:.18;model.rotation.z=0;
  part(model,'arm-left')?.rotation.set(moving?-2.95:-.35,0,moving?-.12:-.55);
  part(model,'arm-right')?.rotation.set(moving?-2.95:-.35,0,moving?.12:.55);
  part(model,'leg-left')?.rotation.set(.08,0,-.06);
  part(model,'leg-right')?.rotation.set(.08,0,.06);
  part(model,'head')?.rotation.set(moving?-1.05:-.12,0,0);
}
export function clearSuperheroFlightPose(model:T.Object3D){
  if(!model.userData.superheroFlight)return;
  model.userData.superheroFlight=false;model.rotation.order='XYZ';model.rotation.x=model.rotation.z=0;
  for(const name of ['arm-left','arm-right','leg-left','leg-right','head'])part(model,name)?.rotation.set(0,0,0);
}
