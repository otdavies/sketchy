"""Fast UPM integrity checks; Unity itself owns compilation and rendering tests."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
package = root / "Packages/com.otdavies.sketchy"
manifest = json.loads((package / "package.json").read_text(encoding="utf-8"))
assert manifest["name"] == package.name
assert manifest["unity"] == "6000.3"
assert manifest["dependencies"]["com.unity.render-pipelines.universal"] == "17.3.0"
assert (package / "Runtime/Shaders/PencilHatching.hlsl").read_bytes() == (root / "reference/hlsl/PencilHatching.hlsl").read_bytes()
guids = set()
for item in package.rglob("*"):
    if any(part.endswith("~") for part in item.relative_to(package).parts):
        continue
    if item.suffix == ".meta":
        guid = re.search(r"^guid: ([0-9a-f]{32})$", item.read_text(), re.M)
        assert guid, f"Invalid GUID: {item}"
        assert guid[1] not in guids, f"Duplicate GUID: {item}"
        guids.add(guid[1])
    else:
        assert Path(str(item) + ".meta").is_file(), f"Missing meta: {item}"
    if item.suffix in (".json", ".asmdef"):
        json.loads(item.read_text(encoding="utf-8"))  # Reject BOMs, as UPM does.
project_manifest = root / "Unity/SketchyTestbed/Packages/manifest.json"
if project_manifest.exists():  # Optional local testbed, excluded from version control.
    project = json.loads(project_manifest.read_text(encoding="utf-8"))
    assert project["dependencies"][manifest["name"]] == "file:../../../Packages/com.otdavies.sketchy"
city = json.loads((package / "Samples~/ReferenceCity/City.json").read_text())
assert len(city["vertices"]) % 21 == 0 and len(city["casters"]) % 21 == 0
print(f"UPM integrity passed: {len(guids)} unique GUIDs; manifests, sample and locked pencil kernel verified.")
