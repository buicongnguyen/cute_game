import { installMobileGameSupport } from './mobile-game-support.mjs';
import { t } from './i18n.ts';
installMobileGameSupport({
  "translate": t,
  "menus": [],
  "fullscreen": false,
  "existingButtons": [
    ".platform-tools button:first-child"
  ],
  "controls": [
    ".platform-tools",
    "#touch-controls",
    ".bottom-bar"
  ]
});
