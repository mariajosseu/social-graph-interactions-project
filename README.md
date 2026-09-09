# Marvel / In the Margins

The first weekly post for Social Graphs and Interactions: an interactive look at the directed link network between 303 Marvel Comics superhero articles.

## Run locally

The page fetches the TSV snapshot, so serve the project over HTTP rather than opening `index.html` directly:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The data files in `data/` are the frozen week-1 release from the course data page. The analysis intentionally loads all nodes before adding edges so the 17 isolates remain part of the graph.