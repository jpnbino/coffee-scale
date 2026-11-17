# Stackup and manufacturing control

## What is recorded today

The installed KiCad 10.0.8 project contains an explicit physical stackup:
top mask 0.010 mm, top copper 0.035 mm, FR4 core 1.510 mm, bottom copper
0.035 mm and bottom mask 0.010 mm. Their sum is the nominal 1.600 mm board.
White silkscreen and paste layers are recorded as surface processes without
thickness values. Finish is ENIG. The dielectric entries are epsilon_r 4.5 and
loss_tangent 0.02; these are design values, not measured material certificates.

The portal extracts those entries directly from the saved PCB and includes its
SHA-256. Its cross-section is schematic, not to scale. Missing values remain
explicitly unspecified. Supplier stackup approval has not been recorded.

This pipeline uses KiCad's Gerber/job, Excellon, IPC-2581, BOM, placement,
STEP, GLB, SVG and PDF exports. Gerbers describe manufactured artwork; they
do not by themselves establish material qualification or process traceability.
KiCad's project data is the design record, not a substitute for a manufacturing
execution or supplier quality system.

## A practical path to scalable manufacturing

1. **Design baseline:** immutable source revision, build recipe/tool versions,
   source/output hashes, electrical checks, stackup, drill/pad/net inventories.
   The local release pipeline implements much of this foundation today.
2. **Supplier-approved specification:** supplier stackup ID and revision,
   laminate grade, copper and final thickness tolerances, impedance coupons
   where required, finish, mask, drill capabilities and approved deviations.
   Compare it with design intent and block release on unresolved differences.
3. **Assembly baseline:** qualified manufacturer parts and alternates,
   approved population variants, rotation/origin review and procurement status.
   Current assembly outputs remain draft until their blockers are resolved.
4. **Change control:** reviewed change request, reason, affected revisions,
   electrical/mechanical/manufacturing impact and approval evidence. A visual
   diff supports this review; it cannot replace the approval record.
5. **Production genealogy:** purchase order, PCB and component lots, assembly
   batch, board serial number, firmware/calibration revision, test results,
   rework and disposition. These records should link to the immutable baseline.

The next useful increment is a supplier-specification schema and a release gate
for its approval, before building production dashboards. Never infer approval
from a clean DRC or manufacture-ready filenames.

## Viewer appearance versus specifications

Purple/white, blue/white and other 3D colour presets are display experiments.
They do not change KiCad, Gerbers or purchase specifications. Layer opacity is
also a visual aid. Gerber transparency can reveal overlapping opposite-layer
copper, but it cannot separate traces and fills already merged on one layer.
The comparison routing view omits fills and can help inspect those tracks.
