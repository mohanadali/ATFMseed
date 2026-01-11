```markdown
# Baghdad FIR — Interactive ATFM counts (prototype)

What this does
- A GitHub Action polls OpenSky (anonymous) and writes `docs/data/flights.json`.
- A GitHub Pages site serves an interactive page that:
  - filters flights to Baghdad FIR box,
  - counts flights at FL240+,
  - splits counts North/South (Baghdad latitude division),
  - shows counts per FL240–350 and FL360–460 bands,
  - displays a red alarm when current UTC time falls into any configured peak window.

How to install
1. Create a repo and add the files above.
2. In Settings → Pages set source to "main branch /docs folder".
3. Allow the workflow to run (or run it manually in Actions). It writes docs/data/flights.json.
4. Visit the Pages URL to view the interactive map and counts.

Notes & next steps
- The page stores the peak schedule in the browser (localStorage). If you want the official schedule committed into the repo, tell me and I will:
  - add a schedule.json file to the repo (or have the Action write it), and
  - make the page fetch that schedule instead of localStorage.
- The example schedule included in the page is best-effort from your message. Please confirm the exact UTC windows and which sector (North/South) and which band(s) apply; I will commit them into the site for everyone to see.
- Altitude uses meters from the OpenSky baro_altitude/geo_altitude fields. FL thresholds use approximate conversion: FL240 ≈ 7315 m.
- If you want alarm thresholds based on counts (e.g., alarm only when count > X), I can add configurable numeric thresholds per sector/band.
- If you need a precise Baghdad FIR polygon for point-in-polygon filtering, I can add a GeoJSON and update the Action to use it.

Would you like me to:
- encode the exact sectorisation windows you posted into the schedule file in the repo (please confirm/correct the list), or
- add count-based alarm thresholds (e.g., red only if > N flights in a band), or
- have the schedule saved/committed to the repo instead of localStorage?
```