# G8 Preparation

Prepared during G7 cumulative verification; G7 is now accepted and G8 is ACTIVE.
Scope F03/F17/F18, comparisons C02/C11/C12. Lead owns codec, document
lifecycle and UI/storage integration. A bounded exporter worker may own a pure CAD
package after the geometry/unit interface is frozen; no shared-store writes.

## Required Work

1. Mature validation without rewriting legacy simulation meaning: bounded JSON
   traversal/size, entity identity collisions and membership diagnostics, finite
   settings, exact optional names/metadata, clear unsupported-model refusal.
   Preserve legitimate zero-rest links and stale optional legacy barriers with
   explicit diagnostics; do not silently drop saved data to make import succeed.
2. Complete file lifecycle: local save/cancel/failure, unsaved Open/Clear choices,
   chooser cancel/retry, recoverable local draft and explicit restore/discard.
   Local recovery must not mark a cloud/local save successful. It must not replace
   a newer current document after async completion or persist transient simulation
   coordinates. Quota/storage-denied failures must leave the active document intact.
3. One CAD geometry boundary for visible authored joints/links/open and closed
   outlines/rails/barriers; convert body-local points once, flip screen Y once,
   exclude hidden solver braces. 25 world units = 10mm. Unit choice affects DXF
   coordinates/metadata; SolidWorks API coordinates remain meters.
4. Export menu with native format/unit choices and honest outcomes, named controls,
   >=44px coarse targets, responsive no-overlap layout. Save/export never silently
   clear dirty state unless the corresponding document save actually succeeds.
5. Independently parse DXF and compare coordinates, radii, visibility, layers and
   open/closed edges in mm/cm/m/in. Test SolidWorks generation against documented
   API syntax and an independent geometry-call reader; target-app execution is
   separately recorded, not inferred from string matching. Record actual installed
   CAD availability before treating it as a dependency.
6. Complete browser workflows and cumulative G1-G7 on the same immutable artifact,
   including original/reopened real-file motion and tablet/WebKit file handling.

## Source Observations To Check

The fork has unit helpers, a DXF writer and a SolidWorks text-macro writer, while
the candidate still has the upstream DXF-only entry point. Do not copy either
exporter wholesale without tests. Fork layer names sanitize user body names and
may collide; body-loop joint output may duplicate shared pivots. Trimmed open paths
must not be reclosed on export. User labels/names interpolated into macro comments
must never inject new executable lines. Check numeric precision and finite bounds,
DXF version/unit-header compatibility, document template/plane error handling and
SolidWorks macro dialect/extension against primary documentation.

Existing codec preserves extensions intentionally; therefore clearing known optional
fields cannot merely remove their keys and let the preserved source resurrect old
values. Do not classify unknown source metadata as authored unsupported functionality.
The current runtime is client-only; recovery does not require a new server backend.

Status: G8 ACTIVE, not yet implemented or accepted. Regressions reopen prior gates.

## Primary References Checked

- [Autodesk 2026 DXF header reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm): version identifiers and insertion-unit codes. This table alone does not establish R12 support for every newer header variable.
- [SOLIDWORKS 2026 macro playback](https://help.solidworks.com/2026/English/SolidWorks/sldworks/c_recording_playing_macros.htm): SWB is accepted and converted to SWP during run/edit; generated text still needs dialect/API and target-app qualification.
- [SOLIDWORKS circle API](https://help.solidworks.com/2022/english/api/sldworksapi/SOLIDWORKS.Interop.sldworks~SOLIDWORKS.Interop.sldworks.ISketchManager~CreateCircleByRadius.html): circle center/radius arguments use meters.
- [SOLIDWORKS default preference API](https://help.solidworks.com/2026/english/api/sldworksapi/SolidWorks.Interop.sldworks~SolidWorks.Interop.sldworks.ISldWorks~GetUserPreferenceStringValue.html): do not trust unexplained numeric enum fallbacks from the fork without checking the installed type library or an alternative documented API.

## Isolated Qualification Dependencies

No SolidWorks/FreeCAD/LibreCAD/AutoCAD/QCAD entry found in the three standard
Windows uninstall registry views, nor matching CAD directory in standard Program
Files folders. This is a scoped inventory, not proof no executable exists anywhere.

Prepared ignored `.rebuild.local/cad-tooling` Python 3.13 venv with ezdxf 1.4.5;
import/version smoke passes. Exact packages pinned in
`scripts/rebuild/requirements-cad.txt`. This independent DXF reader/auditor is not
part of the web runtime and cannot by itself certify a GUI application's import.
[Maintainer package reference](https://pypi.org/project/ezdxf/).

Also prepared LibreCAD 2.2.1.6 from its official stable release, extracting the
installer with 7-Zip into `.rebuild.local/cad-tools/librecad-2.2.1.6` WITHOUT running
the installer or registering a machine-wide installation. Downloaded win64 installer
SHA256 `0cd876d0e3fbfcdcdb85e5019080aca243908f4ad5c3b3c93a55ee9ba154f95b`
matches GitHub's published asset digest. Extracted LibreCAD.exe SHA256
`2b375dcae17da11f95c207abaf81bee9d571cb535b5b8b18da966859f4681d00`.
[Official release](https://github.com/LibreCAD/LibreCAD/releases/tag/v2.2.1.6).
Launch/import/dimensions remain UNVERIFIED until G8. LibreCAD is not a substitute
for SolidWorks macro execution; target-specific limits stay explicit.
