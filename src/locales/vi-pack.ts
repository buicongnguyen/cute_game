import { VI_CATALOG } from './vi-catalog.ts';
import { VI_GAMEPLAY } from './vi-gameplay.ts';
import { VI_ONLINE } from './vi-online.ts';
import { VI_UI } from './vi-ui.ts';
import { VI_FRIENDS } from './vi-friends.ts';
import { VI_BOTS } from './vi-bots.ts';
import { VI_LOOKS } from './vi-looks.ts';
import { VI_UPGRADES } from './vi-upgrades.ts';
import { VI_HOUSE } from './vi-house.ts';
import { VI_HOUSE_TALK } from './vi-house-talk.ts';
import { VI_FRIEND_LINES } from './vi-friend-lines.ts';
import { VI_TESTER } from './vi-tester.ts';
import { VI_FIXES } from './vi-fixes.ts';
import { VI_SKILLS } from './vi-skills.ts';
import { VI_GROUPS, VI_DOG_TOSS } from './vi-groups.ts';
import { VI_SHOP } from './vi-shop.ts';
import { VI_LAKE } from './vi-lake.ts';
import { VI_GARDEN } from './vi-garden.ts';
import { VI_REFUSALS } from './vi-refusals.ts';
import { VI_RANKING } from './vi-ranking.ts';
import { VI_ECON } from './vi-econ.ts';
import { VI_EXTRAS } from './vi-extras.ts';
import { VI_GUIDE } from './vi-guide.ts';
import { VI_SAVE } from './vi-save.ts';
import { VI_MOBILE } from './vi-mobile.ts';

/** Every Vietnamese phrase in one table. Only this module imports the catalog files, so a build ships them as one lazy chunk (i18n.ts loadVietnamese). */
export const VI_PACK: Record<string, string> = Object.assign(Object.create(null), VI_CATALOG, VI_GAMEPLAY, VI_ONLINE, VI_UI, VI_FRIENDS, VI_HOUSE, VI_HOUSE_TALK, VI_FRIEND_LINES, VI_LOOKS, VI_UPGRADES, VI_TESTER, VI_SKILLS, VI_GROUPS, VI_DOG_TOSS, VI_SHOP, VI_LAKE, VI_GARDEN, VI_REFUSALS, VI_RANKING, VI_FIXES, VI_BOTS, VI_ECON, VI_EXTRAS, VI_SAVE);
Object.assign(VI_PACK, VI_GUIDE, VI_MOBILE);
/** The time words a counter may carry in a template slot (i18n.ts compileTemplates): h/m/s/p/g plus the spelled-out units. */
export const VI_TIME_UNITS = 'h|m|s|p|g|giờ|phút|giây';
