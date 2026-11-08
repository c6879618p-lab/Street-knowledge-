# MyCar GPS

Static GPS navigation progressive web app. Search for a destination, get a driving route, and follow turn-by-turn directions on a MapLibre map (OpenFreeMap tiles, OSRM routing, Photon search). The app can use your location, simulate a drive, switch to dark mode, speak directions, and show a custom car icon.

Published with GitHub Pages from the repository root:

https://c6879618p-lab.github.io/Street-knowledge-/

Stylesheets, scripts, icons, the web manifest (`start_url` and `scope` are `./`), and the service worker registration use relative paths so the app loads under the `/Street-knowledge-/` subpath. `.nojekyll` tells GitHub Pages to serve these files as-is.
