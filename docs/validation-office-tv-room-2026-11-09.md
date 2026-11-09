# TV plan and meeting-room layout

The native goal/task whiteboard now shares the existing office TV. There is no
second wall-mounted board in the meeting area. The original screen/frame location
and dimensions stay intact; its display fits goal, current task, completed/total,
blocked count, progress and compact crew/tool counts. Existing announcements still
take over the screen and then become a ticker. ASCII mode also shows the plan.
Clicking either the TV or meeting area opens the existing full plan/agenda dialog.

The meeting area remains left of the elevator. It uses the native cloud curtain
window geometry and renderer, including panes, reflections, frames and kick plate.
The custom plaster side/front partitions were removed. The table runs vertically,
with four inward-facing standard OMP office chairs on either side. Its rug, table,
shadows and seating fit the smallest 198-pixel office floor. Work pods, elevator,
meeting ownership and real execution locations are preserved.

Validation includes instrumented canvas checks that long native plan labels stay
inside both existing TV sizes (100x40 and 132x44), and that a new announcement still
fills the screen. Geometry checks cover the vertical table, eight distinct inward
seats, native cloud panes, unchanged TV/elevator, and the absence of a second board.
Existing exact Run selection, safe dialog rendering, native helper exclusion and
return-to-desk regressions remain covered. The complete rebuilt Office Linux Node
24 suite, plugin suite, typechecking and generated asset checks are run with the
change: 533 Office tests passed with 2 skips, and all 283 plugin tests passed.
Installed host/browser hashes and the six staged observer/MCP/skill files matched
the tested assets. No browser/computer automation or screenshots were used.
