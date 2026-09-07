# Tiny Park

A browser-based Pico Park-style multiplayer platformer built with static HTML/JavaScript, Matter.js physics, and PeerJS/WebRTC networking.

## Features

- Classic cooperative multiplayer rooms
- Versus mode with Team 1, Team 2, and Observer roles
- Host-authoritative team balancing
- Versus rooms require equal non-zero team sizes before starting
- Team race scoring when an entire team reaches the exit first
- Local co-op support in Classic mode
- Arcade/pixel-inspired responsive UI
- Comprehensive in-browser level editor
- Custom level play-testing through localStorage
- No application server required for the game client

## Versus balancing

The host occupies Team 1 by default. Guests may join Team 1, Team 2, or Observer, but the host validates every team change.

A player cannot join a team that is already larger than the other team. For example:

- Team 1: 0 / Team 2: 1 → another player cannot join Team 2.
- Team 1: 1 / Team 2: 2 → another player cannot join Team 2.
- Team 1: 1 / Team 2: 1 → either team may accept the next player.

Observers do not count toward team balance and do not spawn as active players.

## Level editor

Open `lvl.html` or use the **Open Editor** button on the home screen.

The editor includes:

- Tile palette for walls, doors, keys, jump pads, grow/shrink buttons, blocks, and lasers
- Paint, drag-paint, erase, and flood-fill tools
- Undo and redo history
- Non-destructive level resizing
- Grid zoom controls
- Block size and required-player configuration
- Laser rotation
- Player binding and shield rules
- Local draft save/load
- JSON project import/export
- Generated game-data copy
- One-click play testing

## Deployment

The project is static and can be deployed directly to Cloudflare Pages.

Recommended Cloudflare Pages settings:

- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`
- Root directory: `/`

Invite links are generated from the current deployment origin, so they work on Cloudflare Pages, custom domains, localhost, or other static hosts without hardcoded GitHub Pages URLs.
