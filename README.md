# Open Innovation Self-Evaluation

A 16-question self-evaluation that maps an organization across the four modes of open innovation — sourcing, acquiring, selling, and revealing — and returns a research-informed reading of the pattern.

Based on:
- Dahlander & Gann (2010), "How open is innovation?" *Research Policy* 39(6).
- Dahlander, Gann & Wallin (2021), "How open is innovation? A retrospective and ideas forward." *Research Policy* 50(4).

## Run it

Open `oi-evaluation.html` (or `index.html`) in a browser. No build step.

## Deploy

Enable GitHub Pages on this repo (Settings → Pages → Source: `main` branch, root) and it will be live at:
`https://<user>.github.io/oi-evaluation/`

## Data collection

The widget saves each completed response to the user's `localStorage` automatically. To aggregate across executives, set the `DATA_ENDPOINT` constant near the top of the `<script>` block to a backend URL that accepts POST requests with JSON. With the endpoint empty, no data leaves the browser.

To export locally-saved responses from a single browser, open the dev console and run:
```
exportResponses()
```
