# Shipment countries and transport locations

The shipment editor provides independent road, sea and air selectors for loading and arrival. Each then selects a country and a location from that country and transport mode. Both lists support search. Changing country or mode clears the old location selection.

Reference data comes from the official UNECE UN/LOCODE 2025-1 release: 249 countries/territories and 106,056 unique trade/transport locations. Function 1 selects ports (17,520), Function 3 road locations (90,400), and Function 4 air locations (9,029). These counts overlap because one location can support multiple modes. The directory describes transport functions within a location, rather than guaranteeing the current operating status of an individual facility.

`public/data/unlocode-2025-1/index.json` is the small country index. Individual country files are fetched and cached on demand, shared between both selectors. Large result sets show the first 500 matches and offer search across all locations. This avoids rendering tens of thousands of native options at once.

Selections remain readable strings in the existing location columns, e.g. `El Qahira (Cairo) [EGCAI] · Air`. The UN/LOCODE carries the country; the explicit transport suffix preserves the selected mode even for multimodal locations. A country may be saved before choosing a facility, e.g. `EGYPT [EG] · Road`. No schema change, new table or backup-worker migration is required. Existing manually entered location strings remain unchanged until the employee explicitly changes the selection; ambiguous country names are not guessed.

To rebuild from the official archive:

```powershell
python scripts/build-port-catalogue.py <official-release.zip>
```

The generator records the source archive SHA-256, combines CSV parts, selects functions 1/3/4, excludes deleted and alias rows, merges duplicate codes and splits output by country. Attribution and source links are available in the editor, generated index and `public/data/UNLOCODE-NOTICE.txt`.
