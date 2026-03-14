Yes, this is a fairly common technique for capturing API request parameters (like watchlist IDs) from web apps that don't expose them directly in the UI. Here's how it works:
The General Approach
When you use the Lasso tool (or any selection/filter tool) on a platform like Wood Mackenzie or Genscape, the app makes background API calls to fetch data for whatever you've selected. The F12 DevTools Network tab lets you intercept and inspect those calls.
Step-by-Step
Open DevTools before interacting
Press F12 (or Ctrl+Shift+I) to open Chrome DevTools
Go to the Network tab
Click the red record button (should already be recording) and optionally hit Clear (🚫) to flush prior requests
Filter the noise
In the filter bar, type something like api, watchlist, data, or query to narrow down requests
You can also filter by XHR/Fetch (click the "Fetch/XHR" button) to see only API calls, not images/CSS/etc.
Use the Lasso tool on the map/chart
Draw your selection — this triggers the platform to fire off API calls in the background
Watch the Network tab populate with new requests in real time
Inspect the relevant request
Click on a request that looks promising (often a POST or GET to something like /api/watchlist, /data/query, /v1/assets, etc.)
Check the Headers tab for the request URL and any query parameters
Check the Payload tab (for POST requests) — this is often where watchlist IDs, geometry filters, or asset lists live
Check the Response tab to confirm it contains the data you expected
Extract the IDs
The watchlist ID might appear as a query param (?watchlistId=12345), in the request body as JSON ({"watchlist_id": "abc-xyz"}), or embedded in the URL path (/watchlists/12345/data)
Tips for Wood Mackenzie / Genscape Specifically
Their platforms tend to use JWT bearer tokens in the Authorization header — you can sometimes reuse these temporarily for direct API calls (be mindful of ToS)
Watchlist IDs are often GUIDs (e.g., 3f2504e0-4f89-11d3-9a0c-0305e82c3301) or numeric strings
If the lasso selection sends geometry (a polygon), the watchlist ID may be separate from the spatial filter — look for both
Sometimes the ID is in a cookie or session storage — check the Application tab in DevTools if you can't find it in Network calls