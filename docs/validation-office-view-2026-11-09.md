# Read-only office presentation

The Agent Office fork adds browser-local appearance preferences and visual-only
activity, team, meeting and ambient behaviour. No new control or execution API is
used. Orca and OMP retain ownership of work and agent lifecycles.

- The existing outdoor renderer follows the viewer's local clock by default.
  Appearance exposes daylight/dusk/night previews and explicitly decorative
  weather (date-based, clear or rain); no real-weather service is implied.
- Task chips distinguish execution, human attention, blocked/paused plans,
  completed goals and an idle coordinator with team members still present.
  Active tool work takes precedence over plan metadata; idle never means complete.
- Helpers retain their parent's bench. Run groups are scoped by project and
  execution host. Colour marks and hover relationship lines connect ownership
  without moving an executor into the main office.
- Main participants walk through the meeting doorway, around either table layout,
  and return to their desks. Native helpers remain excluded. Speaker indicators
  follow recent reply/shout events, without inventing conversation or audio.
- Native goal completion celebrates once on an observed transition. Reconnection
  does not replay celebrations; explicit celebration/test-pass events remain.
  Review acceptance is not inferred from a finished turn.
- Preferences cover colours, furniture, table orientation, accessories, decor,
  labels, ambient life, movement, relationship lines and celebrations. Storage is
  local to the browser, validates values and supports reset. System reduced-motion
  preference is honoured on first use. Coffee poses and the cat are decorative.

Validation: 45 focused presentation/scene/meeting tests passed. The rebuilt Linux
Node 24 suite passed 543 tests with 2 skips; all 283 plugin tests passed.
Typechecking, production builds and generated-asset checks passed. Final render
ordering and pointer-event CSS refinements were rebuilt after the full suite.
Checks cover exact Run/host isolation, native helper ownership, completion replay,
plan/activity precedence, walking and returning, reconnect before desk placement,
mid-walk cancellation, reduced motion, local-clock lighting, invalid preferences,
and browser-local settings without network requests.

The installed Office bundle is verified by its served asset hash. No user agents,
worktrees or KIND clusters are restarted or modified by this presentation update.
Visual browser inspection has not been performed.
