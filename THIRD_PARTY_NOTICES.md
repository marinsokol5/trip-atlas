# Third-party notices

Trip Atlas's original code, demo JSON, demo text and application screenshots are covered by [MIT](LICENSE). Dependencies and source data retain their own terms.

## Runtime libraries

The production bundle includes React, Lucide React, d3-geo and @cfworker/json-schema with their bundled dependencies; the CLI validator in `dist-node/` bundles @cfworker/json-schema alone, whose license text is in the same file. Minification removes their license comments, so every build regenerates `dist/THIRD_PARTY_LICENSES.txt` with [rollup-plugin-license](https://github.com/mjeanroy/rollup-plugin-license): each package actually included in the bundle, with its exact version, license and full license text, including embedded notices such as Feather's in Lucide and GeographicLib's in d3-geo. The file ships in the npm package and is served beside the app. The build fails if a bundled package has no license or one other than MIT, ISC, BSD or Apache-2.0.

## Map data

`src/assets/world.json` derives from Natural Earth's 1:50m countries dataset, distributed in the [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Its [upstream GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson) was reduced to names, geometry, bounds and ISO2 identifiers, with coordinates rounded to four decimal places. ISO2 identifiers use `ISO_A2_EH` with valid `ISO_A2` fallback; unresolved features remain unhighlighted. The exact upstream revision was not recorded in the initial import.

`src/assets/detail/` derives from Natural Earth's public-domain [1:10m countries](https://github.com/nvkelso/natural-earth-vector/blob/9380cca83db5f9aef52d5e762765100745f84b27/geojson/ne_10m_admin_0_countries.geojson) (revision `9380cca`). `scripts/world-detail.mjs` splits it into one file per ISO2 country in `world.json`, keyed by that file's feature names (parts only 1:10m separates, such as Baikonur, join the country's main feature), simplifies each outline to 0.002° and rounds coordinates to four decimal places. A flat map draws these outlines in place of the 1:50m ones wherever it shows at least 12 screen pixels per degree, roughly a single country or closer.

Some original demo city coordinates came from Natural Earth populated places; Hakone used [Wikidata Q671040](https://www.wikidata.org/wiki/Q671040). Demo map points are approximate location markers. The bundled favicon is original project artwork; no third-party font is included.
