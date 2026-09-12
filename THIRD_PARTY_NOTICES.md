# Third-party notices

Trip Atlas's original code, demo JSON, demo text and application screenshots are covered by [MIT](LICENSE). Dependencies and source data retain their own terms.

## Runtime libraries

The production bundle includes the following packages. Full installed license texts, including embedded third-party notices, are retained in `licenses/`:

| Package | License text |
| --- | --- |
| React | [MIT](licenses/react.txt) |
| React DOM | [MIT](licenses/react-dom.txt) |
| Scheduler | [MIT](licenses/scheduler.txt) |
| Lucide React | [ISC, including Feather's MIT notice](licenses/lucide-react.txt) |
| d3-geo | [ISC, including GeographicLib's MIT notice](licenses/d3-geo.txt) |
| d3-array | [ISC](licenses/d3-array.txt) |
| InternMap | [ISC](licenses/internmap.txt) |

The lockfile records exact versions. Development tools retain the license files supplied in their npm packages. When upgrading runtime dependencies, update these copies if their notices change.

## Map data

`src/assets/world.json` derives from Natural Earth's 1:50m countries dataset, distributed in the [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Its [upstream GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson) was reduced to names, geometry, bounds and ISO2 identifiers, with coordinates rounded to four decimal places. ISO2 identifiers use `ISO_A2_EH` with valid `ISO_A2` fallback; unresolved features remain unhighlighted. The exact upstream revision was not recorded in the initial import.

Some original demo city coordinates came from Natural Earth populated places; Hakone used [Wikidata Q671040](https://www.wikidata.org/wiki/Q671040). Demo map points are approximate location markers. The bundled favicon is original project artwork; no book cover, book map or third-party font is included.

## Japan itinerary inspiration

The Classic Route and Kyūshū & Yakushima demos draw route and suggested duration facts from *Lonely Planet Japan*, 19th edition (July 2026), EPUB ISBN 9781806535927, pp. 28–29 and 36–37. See the [demo source and assumptions](docs/japan-demos.md).

All demo descriptions, day notes, dates, costs and travel estimates are original illustrative material. The book's text, illustrations, maps and cover are not included, and its copyright is not covered by the project's MIT license. Trip Atlas is independent of Lonely Planet and does not imply endorsement.
