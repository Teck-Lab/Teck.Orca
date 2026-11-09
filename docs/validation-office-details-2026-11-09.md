# Office handoffs, seasons, connection health and personal desks

This update extends the existing read-only Agent Office view. It does not submit
tasks, control terminals or change the Orca/OMP execution lifecycle.

- Observed assignments move a small folder from the uniquely identified
  coordinator to its worker. Native helper start/end events and native goal
  completion have corresponding visual transfers. Ownership is scoped to the
  exact host, project and Run; ambiguous coordinators are not guessed. A helper
  ending does not mean it succeeded, and a human-directed reply is not treated as
  a report delivered to its parent. Snapshot reconnects do not replay handoffs.
- Calendar-based scenery adds spring blossoms, summer greenery, autumn leaves
  and winter snow. Appearance offers northern/southern calendars and explicit
  season overrides. Scenery stays inside the existing window clips. Reduced
  motion retains the still seasonal artwork; weather remains decorative.
- Browser feed loss dims and freezes last-known workers, turns their screens
  off and displays a disconnected banner. A fresh snapshot restores the view.
  Independently, authenticated observer heartbeats track each sandbox source.
  Missing heartbeats for over 60 seconds mark the observer disconnected; idle
  agents with heartbeats remain connected. This does not assert that the sandbox
  itself stopped. Repeated heartbeats do not create agents or activity events.
  Existing stale-session expiry still applies, leaving an offline host indicator.
- Session-stable desk accents, short role/identity plates and framed pixel
  pictures survive reconnects and desk reallocation. These identify sessions,
  not a supposed persistent person across unrelated sessions. Handoffs and desk
  details have independent browser-local toggles.

Validation:

- Full isolated Linux Node 24 Office suite: 553 passed, 2 skipped.
- Final focused renderer, presentation, scene, meeting, whiteboard and observer
  suite: 75 passed, including desk bounds, seasonal clipping and grounded trunks
  in both ordinary and taller cloud/meeting windows. These checks and final
  disconnected flip/alarm suppression were validated after the full suite.
- Plugin suite: 283 passed. Typecheck, production build and generated-asset
  checks passed.
- Published the immutable local plugin runtime, reloaded the existing plugin
  with unchanged permissions, and verified the live Office build/asset hashes.
  The live snapshot reported its Docker sandbox observer online, ten workers
  and no synthetic host-status workers at the time of verification. Sandbox
  integration files and MCP tool discovery still matched.

No visual browser inspection was performed. No user OMP session or sandbox was
restarted; an already-open Office page needs a browser refresh to load new assets.

The outdoor follow-up expands the sky/city rendering bounds to cover every
exposed pixel of the taller panes, removing the unpainted dark strip. A seasonal
park foreground adds paths, shrubs, benches and warm dusk/night lamps. The final
focused suite also verifies opaque background coverage at dawn, day, dusk and
night. These are decorative, browser-rendered details; no weather service is used.
