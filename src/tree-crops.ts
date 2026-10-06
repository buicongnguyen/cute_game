import { CROPS } from './content.ts';

/**
 * Fruit trees: crops that take eight hours or more (the eight fruit, content.ts FRUIT_FACTS). They grow at their own pace:
 * fertilizer is refused for them (user decision, round 28), so a stack of spores cannot turn the best crops into a
 * minutes-long loop. Shared by the rules (model.ts fertilize), the bed panel and the tree models (crop-cards.ts).
 */
export const TREE_CROP_MS = 8 * 3_600_000;
export const isTreeCrop = (crop: string) => (Object.hasOwn(CROPS, crop) ? CROPS[crop].duration : 0) >= TREE_CROP_MS;
