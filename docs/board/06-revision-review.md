# Revision review and Gerber inspection

How to compare revisions and inspect the exact files a PCB factory receives.

The version catalogue retains viewable layouts, schematics and manufacturing
files for Rev D, archived Rev E and the current build. It checks historical
source/file hashes, then re-renders review drawings with the current toolchain.
The manufacturing files themselves are copied unchanged from their release.
These selectors are verified release snapshots, not Git commits; linking them
to Git tags is planned.

## Comparing layouts

Choose a base and comparison target on Versions & changes. The separate Board
statistics page follows the global revision selector; comparison shows base/target deltas.

The shared selector is encoded in the URL as `rev`. It controls schematic,
PCB, 3D, stackup, statistics, Gerbers and downloads across pages. The
comparison target changes this same selection. Unknown revisions are rejected
without displaying current artifacts. Historical assembly records and guides
are unavailable because they were not archived; no current records are silently
substituted. Historical 3D/STEP views are re-exported from verified archived
sources, while fabrication files retain their original release content.
Overlay colours identify added, removed and moved/modified features. The change
list zooms to components, vias or track portions. Side-by-side panels share a
viewport; blink alternates complete routing views at the selected copper layer.

Components match by UUID with a reference fallback. Straight tracks are compared
as unions of collinear intervals, so reversing endpoints, overlapping duplicates
and split/merge operations do not create false copper differences. Width, net
or layer changes remain meaningful. Arc reversal is normalized, but equivalent
arc resegmentation is not. Via changes include drill, diameter, layer span and net.

The first comparison omits filled copper zones, artwork, design rules and
semantic schematic changes. A source change without visible differences may
belong to one of those omitted areas. Pad shapes in routing review are simplified;
use manufacturing layers to inspect actual fabricated shapes.

*Gerber difference*, the fourth view, compares the released Gerber and drill
files of the two revisions one layer at a time, from top silkscreen to the
outline. Green areas are only in the selected revision, magenta only in the
earlier one, grey in both. A table gives the added and removed area and the
number of changed regions for every layer, and the list beside the board
zooms to each region, largest first. A layer that only one revision has, such
as the current build's paste, is named instead of compared. Areas come from
rasterising both layers at a stated resolution (normally 20 px/mm), so they are
estimates, and features finer than one pixel may not show. This compares
drawn geometry only, not Gerber attributes, and does not approve a file set.

## Manufacturing layers

The Gerber viewer renders the actual exported Gerber and Excellon files. Every
layer retains its source checksum. Layer offsets are normalized to a shared
absolute coordinate frame rather than independently fitting each image.
Layers are listed as a stack, from top silkscreen down through the core to
bottom silkscreen, then drills and outline, each with its drawing colour. They
are drawn in that physical order, reversed when you view the board from the
bottom, so the side facing you is always on top. You can toggle a layer, show
only one (its *Only* button, or Option/Alt-click), adjust its opacity, and fold
the stack away to give the board more room. The toolbar on the board fits the
whole board (F), zooms (+ and −), measures between two points (M; Esc stops) and
opens fullscreen. Measurements use the displayed view axes when the board is
viewed from the bottom. The line under the board says how many layers were read
and opens each file's checksum and parser notes; a warning appears above the
board only if a layer could not be drawn or the reader reported a real warning.
Mask layers display openings. Plated and non-plated drill files stay separate.

The pinned converter is gerber-to-svg 4.2.8. Basic metric dimensions, clear-polarity
masking and routed Excellon slots have regression tests. Parser notices are
retained: ignored X2 metadata is distinguished from review-required warnings.
This is a review aid, not manufacturing approval; final supplier inspection and
prototype tests remain.

## Checks before ordering

A board spin usually comes from something the electrical checks cannot see: a
part placed off its pads, a pad with no solder paste, or a footprint whose pad
numbers do not match the real part. The Gerber page puts the data for those
checks on top of the manufacturing layers.

- **Layer presets.** *Top assembly* and *Bottom assembly* show one side as the
  assembler sees it: copper, mask openings, paste, silkscreen, outline and
  drills. The bottom view is mirrored. Paste layers come from the current build's
  stencil files.
- **Placement points.** A crosshair marks where the placement file tells the
  assembler to put each part, and a dot marks pin 1. A part whose point is more
  than 0.5 mm from the centre of its courtyard is listed under *Before you
  order*, with its distance from the pad centre too. That usually means a
  footprint whose origin is pin 1, as on pin headers. A courtyard can include an
  overhang, so an entry is a prompt to check the assembler's placement preview,
  not a confirmed error.
- **Missing paste.** A pad of a factory-placed part with copper but no paste
  opening is listed, because reflow will not solder it.
- **Click to identify.** Clicking a pad, track or part names it, highlights its
  whole net, and links to the [interactive design viewer](https://jpnbino.github.io/coffee-scale/explore.html).
  Links such as `gerbers.html?part=J4` or `?net=BAT_P` open with that selection.
- **Pin maps.** Every part whose symbol names its pins is listed with each pad,
  pin name and net, smallest parts first. Compare each row with the
  manufacturer's datasheet, especially transistors, diodes and regulators.

These checks compare the design, the placement file and the paste openings
defined on each footprint pad. They
do not replace DRC, the assembler's own preview, or a datasheet check, and the
rotation each assembler expects can only be confirmed in their preview. The
identification uses the KiCad board data, not net attributes in the Gerber files.

