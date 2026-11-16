"""Independently inspect actual browser downloads; never import app geometry code."""
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import ezdxf

assert ezdxf.__version__ == "1.4.5", ezdxf.__version__
root = Path(sys.argv[1]).resolve()
assert root.is_dir(), root
results = []
scales = {"mm": 0.4, "cm": 0.04, "m": 0.0004, "in": 0.4 / 25.4}
circles = [
    ("base", 75, 180, 5), ("base", 250, 180, 5), ("base", 350, 180, 5),
    ("rod", 75, 180, 5), ("rod", 75, 300, 3.75),
    ("wing", 75, 180, 5), ("wing", 195, 180, 3.75), ("carriage", 300, 180, 3.75),
]
lines = [
    ("rod", 75, 180, 75, 300), ("wing", 75, 180, 195, 180),
    ("Sliders", 250, 180, 350, 180), ("Colliders", 250, 180, 350, 180),
]
# Rod centroid (75,240), original reference angle -pi/2; no app transform call.
paths = [(True, [(55, 255), (55, 225), (95, 225)]),
         (False, [(100, 220), (100, 205), (115, 205)])]


def near(actual, expected):
    assert len(actual) == len(expected), (actual, expected)
    assert all(math.isfinite(a) and math.isclose(a, e, rel_tol=1e-10, abs_tol=1e-12)
               for a, e in zip(actual, expected)), (actual, expected)


def point(x, y, scale):
    return (x * scale, -y * scale, 0)


def verify_dxf(path, unit):
    doc = ezdxf.readfile(path)
    audit = doc.audit()
    assert not audit.errors and not audit.fixes, (audit.errors, audit.fixes)
    assert doc.dxfversion == "AC1009"
    assert "$INSUNITS" not in doc.header
    scale = scales[unit]
    model = list(doc.modelspace())
    assert len(model) == 14, len(model)
    actual_circles = [e for e in model if e.dxftype() == "CIRCLE"]
    assert len(actual_circles) == len(circles)
    for entity, (layer, x, y, radius) in zip(actual_circles, circles):
        assert entity.dxf.layer == layer
        near(tuple(entity.dxf.center), point(x, y, scale))
        near((entity.dxf.radius,), (radius * scale,))
    actual_lines = [e for e in model if e.dxftype() == "LINE"]
    assert len(actual_lines) == len(lines)
    for entity, (layer, ax, ay, bx, by) in zip(actual_lines, lines):
        assert entity.dxf.layer == layer
        near(tuple(entity.dxf.start), point(ax, ay, scale))
        near(tuple(entity.dxf.end), point(bx, by, scale))
        assert entity.dxf.linetype == "DASHED"
    actual_paths = [e for e in model if e.dxftype() == "POLYLINE"]
    assert len(actual_paths) == len(paths)
    for entity, (closed, vertices) in zip(actual_paths, paths):
        assert entity.dxf.layer == "rod"
        assert entity.is_closed == closed
        actual = list(entity.vertices)
        assert len(actual) == len(vertices)
        for vertex, (x, y) in zip(actual, vertices):
            near(tuple(vertex.dxf.location), point(x, y, scale))
    return {"entities": len(model), "auditErrors": 0, "auditFixes": 0,
            "rodLengthInSelectedUnits": 120 * scale, "openPathRetained": True}


def verify_macro(path):
    text = path.read_text(encoding="utf8")
    calls = []
    for line in re.sub(r" _\r?\n\s*", " ", text).splitlines():
        match = re.fullmatch(r" {4}Set segment = SketchMgr\.(CreateLine|CreateCircleByRadius)\(([^()]*)\)", line)
        if match:
            literals = [v.strip() for v in match[2].split(",")]
            assert all(re.fullmatch(r"-?\d+(?:\.\d+)?#", v) for v in literals)
            calls.append((match[1], tuple(float(v[:-1]) for v in literals)))
    circle_calls = [values for kind, values in calls if kind == "CreateCircleByRadius"]
    assert len(circle_calls) == 8
    for values, (_, x, y, radius) in zip(circle_calls, circles):
        near(values, point(x, y, 0.0004) + (radius * 0.0004,))
    line_calls = [values for kind, values in calls if kind == "CreateLine"]
    expected = [point(ax, ay, 0.0004) + point(bx, by, 0.0004) for _, ax, ay, bx, by in lines[:2]]
    for closed, vertices in paths:
        for i in range(len(vertices) if closed else len(vertices) - 1):
            expected.append(point(*vertices[i], 0.0004) + point(*vertices[(i + 1) % len(vertices)], 0.0004))
    expected.extend(point(ax, ay, 0.0004) + point(bx, by, 0.0004) for _, ax, ay, bx, by in lines[2:])
    assert len(line_calls) == len(expected) == 9
    for actual, wanted in zip(line_calls, expected):
        near(actual, wanted)
    return {"circles": 8, "lineCalls": 9, "rodLengthMeters": 0.048,
            "targetAppExecuted": False}


for folder in sorted(root.glob("*-CAD-dialog-download-units-and-modal-isolation")):
    for unit in scales:
        for extension in ("dxf", "swb"):
            path = folder / f"cad-{unit}.{extension}"
            assert path.is_file(), path
            detail = verify_dxf(path, unit) if extension == "dxf" else verify_macro(path)
            results.append({"file": str(path), "unit": unit, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), **detail})
assert results, "No actual browser CAD downloads found"
report = {"passed": True, "files": results, "parser": "ezdxf 1.4.5",
          "cadGuiQualified": False, "solidWorksExecuted": False}
destination = root / "independent-cad-download-report.json"
destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
print(json.dumps({"passed": True, "files": len(results), "report": str(destination)}))
