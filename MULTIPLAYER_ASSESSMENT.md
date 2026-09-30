# Browser multiplayer assessment

Assessed 30 September 2026 for Zoo Garden (`cute_game`). Target: a browser game with an initial two-to-four-player cooperative mode.

## Recommendation

**Keep the existing Three.js game and add an authoritative TypeScript room server.** Unity can also deliver browser multiplayer, but switching engines is a separate rewrite and does not itself add shared gameplay. Reusing the current browser interface, world renderer, controls, and game rules is the more direct route to evaluating cooperative play. This is an engineering recommendation based on the existing project, not a measured performance or operating-cost comparison.

Unity 6000.6.3f1 and its WebGL build-support module were found locally. No Unity port, live Unity build, or multiplayer connection test was performed. **The current game remains single-player.**

| Approach | Fit for this project |
| --- | --- |
| Three.js client + TypeScript room server | Recommended next step. Retains the working browser game and the refined Blender assets while adding shared state. |
| Unity Web + Netcode for GameObjects + Multiplayer Services/Relay | Viable if Unity's scene editor, animation workflow, or future native applications justify rebuilding the client. |

## Proposed two-to-four-player prototype

Use an HTTPS browser client connected over secure WebSockets to a continuously running game-server process. WebSockets provide bidirectional browser-to-server communication. Static hosting serves the game files; a separate backend runs the shared simulation. [MDN WebSocket documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

Start with one private village room, a shareable join code, and a maximum of four players:

1. Players join, see each other's names and characters, move together, leave, and reconnect.
2. The server validates movement and interaction requests, owns enemy behavior and damage, and checks skill cooldowns. Clients display the resulting state and smooth remote movement.
3. One shared garden interaction and one shared enemy establish ownership and reward rules. Each crop can be harvested once; shared combat cannot accidentally grant duplicate rewards.
4. Each player retains separate inventory and progression. The server owns currency, item grants, crop timestamps, and rewards, and saves progress to persistent storage. Preserve existing offline saves separately.
5. Evaluate two browsers and two physical devices, latency, reconnects, simultaneous actions, and a player opening inventory or backgrounding the browser. Extend the other planets only after this small slice works reliably.

The current implementation needs more than position sharing: `main.ts` loads and saves browser-local state, awards combat and fishing rewards locally, and pauses active world simulation when a dialog is open or the document is hidden. Those decisions must move to, or be coordinated with, the server. `model.ts` already separates much of the economy and progression logic, making reuse practical.

## Unity feasibility and tradeoffs

Unity's supported approach is Netcode for GameObjects with Unity Transport and the unified Multiplayer Services SDK. Sessions coordinate joining and leaving; Relay carries game traffic. Unity provides a working session tutorial with independently controlled network players. New work should use the unified SDK rather than the deprecated standalone Relay package. [Session tutorial](https://docs.unity.com/en-us/mps-sdk/tutorials/build-your-first-session), [Relay and Netcode integration](https://docs.unity.com/en-us/mps-sdk/tutorials/relay-and-ngo)

A Unity prototype could use one player as host and up to three guests, with join codes and Relay over secure WebSockets (WSS). Browser builds cannot listen for direct socket connections, but **a browser can host a Unity game session through Relay**: its network connection is outbound to Relay. HTTPS-hosted clients require WSS. [Unity Transport browser support](https://docs.unity3d.com/Packages/com.unity.transport@2.6/manual/websockets.html)

Relay forwards messages; it does not run the game's persistent simulation. Player-hosted co-op depends on the host remaining available and trustworthy. Session host election alone does not transfer synchronized game state. Current documentation directs Netcode for GameObjects projects toward Distributed Authority for migration-related behavior. An initial host-based prototype should save progress and end cleanly when the host leaves; seamless migration is additional scope. For an always-available world or an economy protected from host manipulation, prefer a dedicated authoritative server. [Relay versus Lobby](https://docs.unity.com/en-us/mps-sdk/advanced-config/relay-vs-lobby), [Host migration](https://docs.unity.com/en-us/mps-sdk/session-host-migration)

Unity 6 supports selected mobile browsers, including iOS Safari 15+ and Android Chrome 58+; older statements that Unity Web universally excludes mobile devices are outdated. Device performance still needs testing. Unity 6.6 retains managed-thread and native-socket restrictions. [Browser compatibility](https://docs.unity.com/en-us/engine/6000.5/manual/platform-specific/webgl/intro/browsercompatibility), [Unity 6.6 Web limitations](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/intro/technical-overview)

## Migration scope and decision

Blender model sources, art direction, map layouts, gameplay data, formulas, quest definitions, and test scenarios can carry forward. A Unity migration would rebuild or port the TypeScript rules into C#, the Three.js world into scenes and prefabs, the HTML/CSS interface into Unity UI, and the movement, camera, input, animation, audio, persistence, and networking systems. Material/export compatibility would require verification.

Proceed with Blender asset refinement in the current browser game and use the small authoritative multiplayer prototype as the next evaluation milestone. Reconsider Unity when editor workflow or native-platform requirements provide a concrete benefit large enough to justify that migration.
