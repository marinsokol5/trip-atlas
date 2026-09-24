# Third-party notices

Trip Atlas's original code, demo JSON, demo text and application screenshots are covered by [MIT](LICENSE). Dependencies and source data retain their own terms.

## Runtime libraries

The production bundle includes React, Lucide React and d3-geo with their bundled dependencies. Minification removes their license comments, so every build regenerates `dist/THIRD_PARTY_LICENSES.txt` with [rollup-plugin-license](https://github.com/mjeanroy/rollup-plugin-license): each package actually included in the bundle, with its exact version, license and full license text, including embedded notices such as Feather's in Lucide and GeographicLib's in d3-geo. The file ships in the npm package and is served beside the app. The build fails if a bundled package has no license or one other than MIT, ISC, BSD or Apache-2.0.

## Map data

`src/assets/world.json` derives from Natural Earth's 1:50m countries dataset, distributed in the [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Its [upstream GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson) was reduced to names, geometry, bounds and ISO2 identifiers, with coordinates rounded to four decimal places. ISO2 identifiers use `ISO_A2_EH` with valid `ISO_A2` fallback; unresolved features remain unhighlighted. The exact upstream revision was not recorded in the initial import.

Some original demo city coordinates came from Natural Earth populated places; Hakone used [Wikidata Q671040](https://www.wikidata.org/wiki/Q671040). Demo map points are approximate location markers. The bundled favicon is original project artwork; no third-party font is included.
