"""Build a deterministic port/country catalogue from the official UNECE release ZIP."""
import argparse
import csv
import hashlib
import io
import json
import pathlib
import re
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("archive", type=pathlib.Path)
parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("public/data/unlocode-2025-1/index.json"))
args = parser.parse_args()
countries, ports = {}, {}
with zipfile.ZipFile(args.archive) as archive:
    files = sorted(name for name in archive.namelist() if re.search(r"CodeListPart[123]\.csv$", name))
    if len(files) != 3:
        raise ValueError("Expected the three official UN/LOCODE code-list parts")
    for filename in files:
        for row in csv.reader(io.StringIO(archive.read(filename).decode("utf-8-sig"))):
            if len(row) != 12:
                raise ValueError("Unexpected UN/LOCODE CSV layout")
            change, country, code, name, ascii_name, subdivision, function, status, date, iata, coordinates, remarks = row
            if not code and name.startswith("."):
                countries[country] = {"code": country, "name": name[1:]}
            modes = [mode for position, flag, mode in [(0, "1", "sea"), (2, "3", "road"), (3, "4", "air")]
                     if len(function) > position and function[position] == flag]
            if not modes or change in ("X", "="):
                continue
            locode = country + code
            if not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{3}", locode):
                raise ValueError("Invalid port UN/LOCODE")
            port = {"code": locode, "name": name, "modes": modes}
            if ascii_name != name:
                port["ascii"] = ascii_name
            if locode in ports:
                port["modes"] = sorted(set(port["modes"] + ports[locode]["modes"]))
                ports[locode]["modes"] = port["modes"]
            if locode not in ports or name < ports[locode]["name"]:
                ports[locode] = port
if len(countries) < 240 or len(ports) < 100000:
    raise ValueError("Incomplete official catalogue")
if any(port["code"][:2] not in countries for port in ports.values()):
    raise ValueError("Port without a listed country")
catalogue = {
    "version": "2025-1",
    "source": "https://unlocode.unece.org/publications/",
    "archiveSha256": hashlib.sha256(args.archive.read_bytes()).hexdigest(),
    "attribution": "UNECE / UN/CEFACT UN/LOCODE 2025-1. Functions 1 (port), 3 (road), 4 (air) selected; deleted and alias entries excluded; duplicate location codes combined.",
    "countries": sorted(countries.values(), key=lambda item: item["code"]),
    "locationCount": len(ports),
    "modeCounts": {mode: sum(mode in port["modes"] for port in ports.values()) for mode in ["road", "sea", "air"]},
    "ports": [],
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
country_directory = args.output.parent / "countries"
country_directory.mkdir(parents=True, exist_ok=True)
for code in countries:
    values = sorted((port for port in ports.values() if port["code"].startswith(code)), key=lambda item: item["code"])
    (country_directory / (code + ".json")).write_text(json.dumps({"version": "2025-1", "country": code, "ports": values}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(json.dumps({"countries": len(countries), "locations": len(ports), "modeCounts": catalogue["modeCounts"], "indexBytes": args.output.stat().st_size}))
