# Project and Run floors

The Office view now has a Floors selector and previous/next buttons. All floors
retains the overview; each project/execution-host pair has a project floor, and
each Orca Run has a separate floor within that scope. The existing elevator
indicator displays the selected floor code. The camera resets on user selection.

Native helpers follow their root session through the parent chain, including
nested helpers, late parent discovery, Run reassignment and worker renames.
Matching project names or Run IDs on different hosts do not combine teams.
Coordinators retain office placement; dispatched sessions retain sandbox-cloud
placement within the selected floor.

A global read-only event model continues receiving inactive-floor updates. The
selected scene, activity feed, whiteboard, meetings and counters receive a scoped
view. Ordinary events remain incremental; ownership changes that move existing
actors trigger a scoped snapshot. Switching floors does not replay handoffs or
completion effects, and cannot turn a disconnected feed into a live one.

The selector remembers its identity in browser-local storage. A selected floor
with no remaining sessions stays empty until the user chooses another floor;
it does not silently jump to another team. Counts describe observed sessions and
helpers, not proof of execution. Meeting views include only a visible owner and
visible participants; actual meeting membership is unchanged. Floor selection
introduces no execution, dispatch or sandbox lifecycle operation.

Validation:

- Complete isolated Linux Office suite: 573 passed, 2 skipped (575 total).
- Focused UI, scene, observer and floor suite: 91 passed.
- The 12 floor-specific checks passed again after a final accessibility
  refinement that avoids announcing unchanged counts on every event.
- Typechecking and production build passed. Generated plugin assets checked.
- Live snapshot projection verified unique project membership and intact native
  family grouping. The installed browser build is checked by its served hash.

Coverage includes exact host/project/Run isolation, hidden event updates,
late ownership, renames, revocation, meetings, offline hosts, reconnect/replay,
malformed stored selection, cyclic parent metadata and safe DOM text. No visual
browser inspection was performed. An open Office page needs a refresh for the
new selector.
