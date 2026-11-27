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
PCB, 3D, stackup, statistics and downloads across pages. The comparison target
and Gerber selector change this same selection. Unknown revisions are rejected
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

## Manufacturing layers

The Gerber viewer renders the actual exported Gerber and Excellon files. Every
layer retains its source checksum. Layer offsets are normalized to a shared
absolute coordinate frame rather than independently fitting each image.
You can toggle layers, adjust each layer's opacity, mirror the board, use
fullscreen, zoom/pan and measure with a visible two-point ruler. While measuring,
pan is paused; the first point anchors a live preview and the second leaves the
distance label on the image. Measurements use displayed view axes when mirrored.
Mask layers display openings. Plated and non-plated drill files stay separate.

The pinned converter is gerber-to-svg 4.2.8. Basic metric dimensions, clear-polarity
masking and routed Excellon slots have regression tests. Parser notices are
retained: ignored X2 metadata is distinguished from review-required warnings.
The converter does not expose X2 nets in this view. This is a review aid, not
manufacturing approval; final supplier inspection and prototype tests remain.
