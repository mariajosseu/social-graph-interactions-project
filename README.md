# Marvel / In the Margins

An eight-week field journal for Social Graphs and Interactions, exploring network structure through Marvel superheroes and the philosopher network.

## Published posts

- **Week 01 — Who gets named?** An introduction to the Marvel network, its degree distribution, connected components, and central characters.
- **Week 02 — What makes the Marvel Universe look like Marvel?** Interactive experiments with degree-preserving shuffles, preferential attachment, degree distributions, and the friendship paradox.
- **Week 03 — Who carries the Marvel Universe?** Explore shortest paths, betweenness centrality, targeted hub removal, and triangle-rich neighborhoods.
- **Week 04 — When does the network come apart?** Explore weighted philosopher links, Louvain communities, and the disparity-filter backbone at five values of α.
- **Week 05 — Does network fame buy you more words?** Compare Marvel in-degree with local description length, inspect the text behind each point, and test how much the frozen blurbs say about a character.

- **Week 06 — Close in words, far in the graph.** Find text-similar pages far apart in the network, contrast community vocabularies on held-out pages, and test LDA bridges with a half-page check.
- **Week 07 — From meaning to measurement.** Compare semantic similarity with hyperlink distance, test topic/embedding/community groupings, probe sentiment and story arcs, compare entity co-occurrences with hyperlinks, and see when BM25 keyword search or dense embeddings retrieve more useful Marvel pages.

## Run locally

The page fetches the TSV snapshot, so serve the project over HTTP rather than opening `index.html` directly:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The data files in `data/` are frozen releases from the course data page. Week 02 uses the precomputed snapshot in `data/week2_story.json`; Week 03 uses the generated snapshot in `data/week3_story.json`; Week 04 uses the philosopher release in `data/week4_philosophers_nodes.tsv`, `data/week4_philosophers_edges.tsv`, and the generated snapshot in `data/week4_story.json`.

Week 07 uses the frozen Marvel article texts in `data/marvel_pages/` and network snapshots in `data/week1_nodes.tsv` and `data/week1_edges.tsv`. Its interactive experiments read the precomputed JSON snapshots in `data/week7_*.json`.

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
- `week-01.html` through `week-08.html` are the published weekly posts.
- `weeks/week2/` through `weeks/week7/` contain post-specific styles and scripts.
- `tools/generate_week2_data.py`, `tools/generate_week3_data.py`, and `tools/generate_week4_data.py` regenerate the analysis snapshots.
- `data/` contains the frozen network snapshots.

Question 07 in Week 05 ranks lexical outliers using unit-normalized word-count vectors and cosine distance from their mean. Compare full articles with a cleanup that removes trailing reference sections and numeric tokens. Regenerate its snapshot with:

```sh
python3 tools/generate_week5_weirdness.py
```

The generator reads the page manifest in `data/week5_search.json` and the frozen article texts in `data/marvel_pages/`.

Regenerate the Week 06 snapshot (`data/week6_questions.json`; needs scikit-learn and NetworkX) with:

```sh
python3 tools/generate_week6_questions.py
```

Week 06 Question 06 compares the full TF-IDF similarity of every page pair with a second pass that masks likely proper names. The resulting name-driven and meaning-driven pair lists are stored in the same snapshot.

Week 06 Question 07 maps characters by an explicit vocabulary contrast (mutant/X-Men versus Spider-Man/symbiote terms) and network visibility, then tests name density as a plausible but noisy alternative.

Week 07 Question 05 compares the sentence-level character co-occurrence network with the undirected Wikipedia hyperlink network. Regenerate its snapshot with NetworkX and `sentence-transformers` installed:

```sh
python3 tools/generate_week7_text_network.py
```

Question 06 compares BM25 keyword retrieval with MiniLM embedding retrieval over the same article texts. Regenerate its snapshot with scikit-learn and `sentence-transformers` installed:

```sh
python3 tools/generate_week7_retrieval.py
```
