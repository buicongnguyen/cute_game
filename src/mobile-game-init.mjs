import { installMobileGameSupport } from './mobile-game-support.mjs';
installMobileGameSupport({
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
