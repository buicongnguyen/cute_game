import * as M from './model.ts';
import { HelperView } from './helper-view.ts';
import { helperOf, nextTask, stillDue, type FarmHelperTask } from './farm-helper.ts';

export const FARM_HELPER_HOME = { x: M.PEN.x + M.PEN.hw - .5, z: M.PEN.z + M.PEN.hd + .45 };
interface Frame {
  state: M.SaveState | null; context: unknown; act: boolean; pending: boolean; now: number;
  position(uid: number): { x: number; z: number } | undefined;
  work(task: FarmHelperTask): boolean;
}

/** Same six rigid helper.glb parts as the gardener; visitors only see a harmless patrol. */
export class FarmHelperView {
  private robot = new HelperView();
  readonly group = this.robot.group;
  x = FARM_HELPER_HOME.x; z = FARM_HELPER_HOME.z; facing = 0;
  mode: 'idle' | 'walk' | 'work' = 'idle';
  task: FarmHelperTask | null = null;
  private state: M.SaveState | null = null;
  private context: unknown;
  private wait = 0; private workLeft = 0; private patrol = 0;
  constructor() { this.group.name = 'animal-pen-helper'; }
  reset() { this.x = FARM_HELPER_HOME.x; this.z = FARM_HELPER_HOME.z; this.mode = 'idle'; this.task = null; this.wait = 0; this.workLeft = 0; }
  update(dt: number, f: Frame) {
    const s = f.state;
    if (s !== this.state || f.context !== this.context) { this.reset(); this.state = s; this.context = f.context; }
    const h = s && helperOf(s), show = !!s && M.penBuilt(s) && !!h?.owned;
    if (!show || !s || !h) { this.robot.present(dt, { visible: false, x: this.x, z: this.z, facing: this.facing, mode: 'idle' }); return; }
    if (h.paused || f.pending) { this.task = null; this.mode = 'idle'; this.workLeft = 0; }
    if (this.mode === 'work') {
      this.workLeft -= dt;
      if (this.workLeft <= 0) {
        // Look again before acting: the task was picked up to half a second before the walk and the pose.
        if (f.act && this.task && stillDue(s, this.task, f.now)) f.work(this.task);
        this.task = null; this.mode = 'idle'; this.wait = .6;
      }
    } else if ((this.wait -= dt) <= 0 && !h.paused && !f.pending) {
      this.wait = .5;
      if (f.act) this.task = nextTask(s, this, f.now);
      else if (!this.task) {
        const animals = M.farmOf(s).animals.filter(a => a.kind !== 'dog');
        const animal = animals.length ? animals[(this.patrol++) % animals.length] : undefined;
        this.task = animal ? { kind: 'collect', uid: animal.uid } : null;
      }
    }
    const target = this.task && f.position(this.task.uid);
    if (this.task && !target) { this.task = null; this.mode = 'idle'; }
    if (this.mode !== 'work') {
      const goal = target ?? FARM_HELPER_HOME, dx = goal.x - this.x, dz = goal.z - this.z, distance = Math.hypot(dx, dz), stand = target ? .72 : .04;
      if (distance > stand) {
        const step = Math.min(distance - stand, dt * 1.7); this.x += dx / distance * step; this.z += dz / distance * step; this.mode = 'walk';
        this.facing += Math.atan2(Math.sin(Math.atan2(dx, dz) - this.facing), Math.cos(Math.atan2(dx, dz) - this.facing)) * Math.min(1, dt * 10);
      } else if (this.task && !f.pending && !h.paused) { this.mode = 'work'; this.workLeft = f.act ? .8 : 1.6; }
      else this.mode = 'idle';
    }
    this.robot.present(dt, { visible: true, x: this.x, z: this.z, facing: this.facing, mode: this.mode, work: this.task?.kind === 'feed' ? 'plant' : 'harvest' });
  }
}
