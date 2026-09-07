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

## Five-level campaign

Every stage keeps the same core goal: **get the key, open the exit door, and get the team through**.

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

In Versus, each lane is generated from that team's player count. Team balancing normally makes both counts equal, but the template API remains independent per team.

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
7. Finishing a team's exit advances only that team to its next stage.
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
- observer clients follow the leading stage; tied teams can be framed together

Campaign falling/respawn logic returns players to their current team's current-stage checkpoint instead of the global map origin.

## Level editor

Open `lvl.html` or use **Open Editor**.

The editor includes:

- Campaign Template picker for Levels 1–5
- 1–6 player template preview/generation
- Tile palette for walls, doors, keys, jump pads, grow/shrink buttons, blocks, and lasers
- Paint, drag-paint, erase, and flood-fill tools
- Undo/redo
- Non-destructive resizing
- Grid zoom
- Block size and required-player configuration
- Laser rotation
- Player binding and shield rules
- Local draft save/load
- JSON project import/export
- Generated game-data copy
- One-click play testing

Campaign pressure-gate/shield/tether behavior remains defined in the configurable campaign template source; loading a template into the editor gives you an editable geometry snapshot for the selected player count.

## Architecture

Key files:

- `src/campaignTemplates.js` — dynamic level generation and campaign configuration
- `src/levels.js` — converts templates into runtime objects
- `src/level.js` — generated-level loading and optimized collision geometry
- `src/host.js` — team caps, balancing, observer host, match/stage authority
- `src/client.js` — lobby/campaign synchronization
- `src/door.js` / `src/entity.js` — team/stage-scoped exits and keys
- `src/camera.js` — smooth camera tracking
- `src/lobby.js` — role/progress UI and campaign respawn behavior
- `src/editor.js` / `src/editorTemplates.js` — visual editor and campaign template bridge

## Deployment

The project remains completely static and can be deployed directly to Cloudflare Pages.

Recommended settings:

- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`
- Root directory: `/`

Invite links are generated from the current deployment origin, so Cloudflare Pages, custom domains, localhost, or other static hosting work without a hardcoded GitHub Pages URL.
