# Netcode review and stabilization

The old implementation was not robust under latency. This revision stabilizes host-authoritative multiplayer; it is not a claim that browser hosting is the best production architecture for a competitive game.

## Findings

- `setPlayerWithData` directly teleported simulated clients to each 20 Hz snapshot. There was no input acknowledgement/replay or reconciliation. Local physics ran ahead and was repeatedly pulled back to an earlier host state.
- Outgoing controls were read from the player's replicated state. Incoming snapshots could overwrite those keys before they were sent, effectively feeding old input back to the host.
- Movement used wall-clock elapsed time, while Matter advanced simulation time. Back-to-back catch-up updates could move almost zero distance; slow frames could move too far. Matter 0.19's fixed Runner also needs an accumulator to avoid one simulation tick per display frame on high-refresh monitors.
- Reliable ordered transport carried both control messages and disposable world snapshots, allowing lost older data to delay newer data.
- Client and observer physics independently simulated ropes, blocks, falling and interactions without a deterministic shared timeline.
- Browser hosting remains susceptible to tab suspension, CPU stalls, host disconnection and host advantage. No remote-host stall measurement was available in the user's report; these are architectural limits, not a confirmed diagnosis of that particular session.

## Implemented

- Live keyboard state is the only source of guest input. Changes send immediately, with 20 Hz heartbeats and monotonically increasing sequence numbers. Older inputs are discarded; input silence clears held keys after 500 ms. Jump press IDs survive a lost short-tap packet via later heartbeats.
- Reliable PeerJS traffic handles lobby, assignment, campaign, transitions and results. A separate raw RTC data channel handles disposable input and snapshots, using `ordered: false` and `maxRetransmits: 0`. It drops updates under backpressure rather than appending stale state indefinitely.
- Identity and campaign setup are acknowledged before snapshots begin. The host still assigns identities, owns collision/exit decisions and never trusts client positions.
- Host simulation advances fixed 60 Hz steps using an elapsed-time accumulator. Excessive catch-up is bounded to 100 ms per clock event. A browser Worker drives host physics and snapshot scheduling independently of requestAnimationFrame, so merely hiding the host view does not stop simulation. Full browser/device suspension can still stop a room. Clients do not run a second speculative simulation.
- Clients and observers interpolate a bounded snapshot history with a 100 ms playback delay. Playback never advances beyond received host state. Network stalls freeze the last state and show a waiting message in versus views; newer snapshots resume playback. Sequence and level revision checks reject stale updates. Teleports/respawns are treated as discontinuities.
- Players, keys, and blocks share the playback timeline. Removed keys/blocks are removed from client state. Both versus and classic use the same playback approach.
- `clientConnection.recentPing` exposes an RTT measurement. `game.networkPlayback` exposes the bounded frame buffer and last arrival time for debugging.

## Validation

Automated real WebRTC tests cover normal rooms, two-versus-two with late observer arrival, all five round transitions, classic repeated-start announcements, and a movement scenario with 70-180 ms snapshot delivery delays, 20% snapshot loss, additional input loss/reordering, key release, and an outage/recovery. Forward walking must remain monotonic; outages must not extrapolate movement. A separate test advances 60 physics ticks back-to-back and verifies 165 px of horizontal movement, independent of wall-clock execution speed.

These tests simulate selected application-level delivery faults. They do not certify every real network, NAT/firewall configuration, long-running background tab, device, or maximum-size edited level.

## Latency and production recommendation

Removing uncorrected prediction eliminates that source of visible rewinds, but guest input now pays the network round trip, host scheduling, snapshot cadence, and the 100 ms playback buffer. The host still sees immediate local movement. This is a deliberate stable baseline, not low-latency client prediction.

For competitive production play, move authoritative room simulation to a dedicated regional server, then implement fixed-tick input acknowledgements plus client prediction and reconciliation. Because players stack, push shared blocks and use ropes, prediction must account for shared physics; merely lerping a corrected player position is insufficient. Keep remote entities interpolated, bound replay history, and test collisions and transitions under latency before enabling prediction. A database such as Firebase is not a replacement for this simulation/transport layer.

## References

- [Glenn Fiedler: Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/) explains buffered authoritative state rendering and the interpolation latency tradeoff.
- [Glenn Fiedler: State Synchronization](https://gafferongames.com/post/state_synchronization/) explains why simulation state correction and extrapolation require a coherent approach.
- [Matter.js running guidance](https://github.com/liabru/matter-js/wiki/Running) describes stepping the engine explicitly.

Implementation is in `src/network-playback.js`, `src/multiplayer.js`, `src/host.js`, `src/client.js`, `src/versus.js`, `src/game.js`, `src/matterInit.js`, and `src/controls.js`. Tests are in `tests/browser/network.spec.cjs` and `tests/browser/multiplayer.spec.cjs`.
