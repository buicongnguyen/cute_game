// The optional game modes, bundled as one lazy chunk. main.ts imports this file with import(), prefetches it at idle once the title
// is up and builds each mode from these exports (mountModes). Nothing else may import it statically, or the split is lost.
export { initDungeon } from './dungeon.ts';
export { initCtf } from './ctf.ts';
export { initRescue } from './rescue.ts';
export { ColossusEvent } from './colossus.ts';
export { initRanking } from './ranking.ts';
export { initNewsBoard } from './news-board.ts';
