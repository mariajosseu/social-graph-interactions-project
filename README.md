# Marvel / In the Margins

An eight-week field journal for Social Graphs and Interactions, exploring network structure through Marvel superheroes and the philosopher network.

## Published posts

- **Week 01 — Who gets named?** An introduction to the Marvel network, its degree distribution, connected components, and central characters.
- **Week 02 — What makes the Marvel Universe look like Marvel?** Interactive experiments with degree-preserving shuffles, preferential attachment, degree distributions, and the friendship paradox.
- **Week 03 — Who carries the Marvel Universe?** Explore shortest paths, betweenness centrality, targeted hub removal, and triangle-rich neighborhoods.
- **Week 04 — When does the network come apart?** Explore weighted philosopher links, Louvain communities, and the disparity-filter backbone at five values of α.

## Run locally

The page fetches the TSV snapshot, so serve the project over HTTP rather than opening `index.html` directly:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The data files in `data/` are frozen releases from the course data page. Week 02 uses the precomputed snapshot in `data/week2_story.json`; Week 03 uses the generated snapshot in `data/week3_story.json`; Week 04 uses the philosopher release in `data/week4_philosophers_nodes.tsv`, `data/week4_philosophers_edges.tsv`, and the generated snapshot in `data/week4_story.json`.

To regenerate the Week 03 snapshot after changing the frozen network, install NetworkX and run:

```sh
python3 -m pip install networkx
python3 tools/generate_week3_data.py
```

The analysis intentionally loads all nodes before adding edges so the 17 isolates remain part of the graph. The links represent article references in the dataset, not verified friendship, influence, or team membership.

To regenerate the Week 04 snapshot after changing the philosopher release, run:

```sh
python3 tools/generate_week4_data.py
```

## Project structure

- `index.html` and `app.js` contain the homepage, archive, and shared network overview.
- `week-01.html`, `week-02.html`, `week-03.html`, and `week-04.html` are the published weekly posts.
- `weeks/week2/`, `weeks/week3/`, and `weeks/week4/` contain post-specific styles and scripts.
- `tools/generate_week2_data.py`, `tools/generate_week3_data.py`, and `tools/generate_week4_data.py` regenerate the analysis snapshots.
- `data/` contains the frozen network snapshots.
