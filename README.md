# Tiny Park

A browser-based PICO PARK-style multiplayer platformer built with static HTML/JavaScript, Matter.js physics, and PeerJS/WebRTC networking.

## Current gameplay

- Classic cooperative multiplayer
- Versus mode with Team 1, Team 2, and Observer roles
- Up to **6 active players per team / 12 total active players**
- Host-authoritative team balancing
- The host starts as an **Observer** in Versus and does not need to occupy a team slot
- Versus starts only when both teams are equal and non-zero
- Team membership locks after the match begins
- Each team progresses independently through the same five-level campaign
- **First team to clear Level 5 wins the match**
- Observers do not affect player counts, level scaling, physics, exits, or camera targeting
- Smooth player-aware dynamic camera with pan + zoom
- Player-count-aware campaign geometry for 1–6 players

## Movement scale

Normal player height is one 50 px tile. A normal vertical jump rises approximately 56 px (1.12 tiles): a one-block ledge is reachable, but a two-block wall cannot be climbed solo. Standing on a teammate provides the extra block of height. Ground checks require support beneath the feet, preventing wall contacts from granting extra jumps. Jump pads retain their stronger launch; grow/shrink blocks still change player size.

## Five-level campaign

Every stage keeps the same core goal: **get the key, open the exit door, and reach the exit**.

The campaign templates live in `src/campaignTemplates.js`. They are generated from the active player/team count instead of being fixed maps.

1. **Stack School** — introductory stacking puzzle. The target ledge rises as team size grows.
2. **Tether Trouble** — players are linked together and cross pits whose widths/obstacles change with player count. One-player previews receive a solvable fallback.
3. **Shield Relay** — one deterministic player per team receives the shield and must protect the group through a laser corridor.
4. **Hold The Line** — pressure switches physically control a blocking gate. The switch must remain occupied; the one-player version supplies a movable weight solution.
5. **Final Exam** — combines pits, player-count-weighted blocks, a shield/laser section, simultaneous switches, and a final stacking challenge.

### Dynamic scaling

Campaign generation clamps a team to 1–6 players. Scaling changes actual geometry and mechanics rather than only changing a required-player number. Examples include:

- stack/ledge height
- pit widths
- obstacle placement
- room width
- weighted block width and required pushers
- switch count/requirements
- single-player fallbacks

In Versus, each independent world is generated from that team's player count. Team balancing normally makes both counts equal, but the template API remains independent per team.

## Configuring campaign templates

The high-level tuning values are in:

```js
CAMPAIGN_TEMPLATE_CONFIG
```

inside `src/campaignTemplates.js`.

The file exposes:

- `CampaignTemplates.buildStage(levelNumber, playerCount)`
- `CampaignTemplates.buildVersusCampaign({ team1, team2 })`
- `CampaignTemplates.toEditorProject(levelNumber, playerCount)`

This keeps the shipped campaign configurable while allowing the visual editor to load a generated 1–6 player version and then edit its geometry.

## Versus flow

1. Host creates a Versus room and begins as Observer.
2. Players choose Team 1, Team 2, or Observer.
3. A team can never exceed 6 players.
4. A player may not stack the larger team; when counts are tied, either team can accept the next player.
5. The match starts only with equal, non-zero teams.
6. Both teams start Level 1.
7. The first living teammate entering the unlocked exit automatically advances their entire team. No Down press is required in Versus.
8. First team to finish Level 5 wins.

The host may optionally join a team before the match, subject to the same balancing/cap rules.

## Dynamic camera

`src/camera.js` replaces the old whole-level-fit behavior with a smooth shared camera:

- follows the bounding box of active players
- interpolates position for smooth scrolling
- zooms out as teammates spread apart
- clamps zoom so players remain readable
- ignores observers
- active Versus clients follow their own team/current stage
- observers see two independently tracked views with a divider; views stack on narrow screens
- each team has a separate Matter engine, current level, keys, gates, blocks and physics
- stage/revision-tagged snapshots send players only their team world and observers both worlds

Campaign falling/respawn logic returns players to their current team's current-stage checkpoint instead of the global map origin.

## Interface

The home page, room dialogs, lobby, game HUD, and editor share a minimal off-white and orange interface using Arial. The home page exposes just Create Room, Join Room, and Level Editor; secondary settings appear in dialogs or expandable sections. Original game sprites and physics are preserved.

## Level studio

Open `/lvl`. The editor preserves all five shipped stages, including gates, switches, shields, tether rules, and weighted blocks. There are 30 independently editable layouts: five rounds for each team size from 1 to 6. Changing the round or team-size dropdown immediately selects its saved layout.

- Palette and canvas use the game's original sprite atlases.
- Place and drag-paint, select, erase, or flood fill an empty area.
- Hold Space and drag (or use the middle mouse button) to pan during placement. Wheel/trackpad pans; Ctrl/Cmd + wheel zooms at the cursor. Fit restores the full level.
- Click an object for Move, Rotate, Duplicate, or Delete. Move picks up the selected object; click its destination. Escape cancels. Gate deletion also deletes its linked switches.
- The inspector edits object size, level dimensions, tether rules, shields, and switch-to-gate links. Shrinking a level rejects changes that would cut off objects.
- Undo/redo and automatic local draft saving preserve edits across layout changes and reloads. Import/export uses validated campaign JSON, never executable JavaScript. Legacy JSON projects can be imported into the selected round; a previous local draft is recovered automatically. Old base64 JavaScript exports are intentionally unsupported.
- Play Test runs the same physics and renderer in the editor workspace. Arrows move, down enters an exit, Tab switches teammates, and Escape returns to editing. Restart or leave the test without changing the draft.
- Keyboard tools: V select, B place, F fill, E erase, H pan, R rotate, Delete remove, Ctrl/Cmd + Z undo, Ctrl/Cmd + Shift + Z redo.

## Publishing levels

The **Admin** button is fixed at the editor's bottom right. Enter the server-side admin password and publish the full campaign. Every layout must have one spawn and one exit, valid geometry, and valid gate connections. Play-test each round before publishing; structural validation cannot prove a puzzle is solvable.

The endpoint uses a Cloudflare D1 database (`LEVELS_DB`) and the `ADMIN_PASSWORD` Pages secret. It validates the campaign, limits upload size and password attempts, checks request origin, and uses an atomic revision comparison to prevent simultaneous publishers overwriting one another. A conflict requires reloading and reviewing the latest campaign. Passwords are never embedded in browser assets or persisted by the editor.

New matches fetch published levels. The host sends its campaign snapshot to clients so all players use the same geometry; a publication does not alter a running match. If no campaign is published, the original dynamic templates are used. Local drafts remain separate from live levels. Firebase is not required.

## Networking

The host owns fixed-step physics, player identity, team balancing, checkpoint progress, and the winner. Each guest uses a reliable PeerJS control channel plus an unordered, non-retransmitting RTC channel for disposable movement updates. Live sequenced input is separate from replicated player state. Snapshots run at 20 Hz; guests and observers render a bounded history with a 100 ms interpolation buffer instead of running conflicting physics simulations. Input silence clears held keys after 500 ms. Team roles lock when play starts, and disconnecting a competitor stops the match.

This stable playback approach adds network and buffering latency to guest controls. Browser-host stalls and host advantage remain; production competitive play should use a dedicated authoritative simulation with tested prediction/reconciliation. See [the netcode review](docs/NETCODE.md) for findings, changes, tests, and limits.

Production still uses the public PeerJS signaling service and its configured ICE servers. Signaling failures are shown in the lobby and reconnect attempts back off. Tests use a local signaling server with actual browser WebRTC channels so rate limits on the public service do not make the regression suite flaky. Restrictive NAT/firewall environments may require a dedicated TURN service; that is not provisioned here.

## Development and tests

Requires Node.js and npm:

```sh
npm ci
npx wrangler d1 migrations apply tiny-park-levels --local
npm run dev
```

Put `ADMIN_PASSWORD=your-local-password` in ignored `.dev.vars` to test publishing. During initial setup an ignored `ADMIN-ACCESS.local` file contains the generated production password; it is not deployed or committed. Rotate it with `npx wrangler pages secret put ADMIN_PASSWORD --project-name tiny-park`.

```sh
npm test
npm run test:browser
```

Browser tests expect the Pages dev server on port 8788 and Microsoft Edge. Playwright starts a local signaling server on port 9000. Publishing tests read the ignored `admin-secret.local` generated during setup and only modify the local database. To test from a fresh checkout, create that file as `{ "ADMIN_PASSWORD": "your-local-password" }` matching `.dev.vars`. Set `PARK_PUBLIC_SIGNALING=1` to exercise the public signaling service instead.

## Cloudflare Pages

Verified project: `tiny-park` (`https://tiny-park.pages.dev`). Its Git source is **xyxyxyrex/picoParkClone**, production branch `main`. The original workspace pointed at a separate `tiny-park` mirror; that remote is now retained as `mirror-origin`, while `origin` points at the deployment source.

- Framework: None
- Build command: `npm run build`
- Build output: `dist`
- Root directory: repository root
- D1 binding and database ID: `wrangler.jsonc`
- Secret: `ADMIN_PASSWORD`
- Schema: `migrations/0001_levels.sql`

```sh
npx wrangler d1 migrations apply tiny-park-levels --remote
npm run build
npx wrangler pages deploy dist --project-name tiny-park
```

Only the allowlisted static files in `scripts/build.cjs` are copied to `dist`; `/api/*` is handled by Pages Functions. Source, tests, secrets, and local artifacts stay outside the deployed assets. The password-protected publication endpoint updates campaign data without rebuilding or redeploying the site.
