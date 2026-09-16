# Marvel / In the Margins

An eight-week field journal for Social Graphs and Interactions, exploring the directed link network between 303 Marvel Comics superhero articles.

## Published posts

- **Week 01 — Who gets named?** An introduction to the Marvel network, its degree distribution, connected components, and central characters.
- **Week 02 — What makes the Marvel Universe look like Marvel?** Interactive experiments with degree-preserving shuffles, preferential attachment, degree distributions, and the friendship paradox.
- **Week 03 — Who carries the Marvel Universe?** Explore shortest paths, betweenness centrality, targeted hub removal, and largest undirected and directed cliques with sourced team affiliations.

## Run locally

The page fetches the TSV snapshot, so serve the project over HTTP rather than opening `index.html` directly:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The data files in `data/` are the frozen Week 01 release from the course data page. Week 02 uses the precomputed snapshot in `data/week2_story.json`; Week 03 uses the generated snapshot in `data/week3_story.json`.

To regenerate the Week 03 snapshot after changing the frozen network, install NetworkX and run:

```sh
python3 -m pip install networkx
python3 tools/generate_week3_data.py
```

The analysis intentionally loads all nodes before adding edges so the 17 isolates remain part of the graph. The links represent article references in the dataset, not verified friendship, influence, or team membership.

## Project structure

- `index.html` and `app.js` contain the homepage, archive, and shared network overview.
- `week-01.html`, `week-02.html`, and `week-03.html` are the published weekly posts.
- `weeks/week2/` and `weeks/week3/` contain post-specific styles and scripts.
- `tools/generate_week2_data.py` and `tools/generate_week3_data.py` regenerate the analysis snapshots.
- `data/` contains the frozen network snapshots.

Experiment 04 uses `data/week3_teams.json`, a separate Wikipedia affiliation snapshot for all 303 network characters, including the 11 distinct largest-clique members. Regenerate it with Python 3.9 or later (no extra dependencies):

```sh
python3 tools/scrape_week3_teams.py --all --cache-dir /tmp/week3-team-articles
```

Use `--refresh` to download fresh articles instead of reusing the cache. The scraper reads only infobox **Team affiliations**, preserves multiple memberships and historical or alternate-version labels, and records article URLs, revision links when available, retrieval dates, and the extracted source field. Linked Wikipedia titles identify affiliations across different display labels. It does not infer missing memberships: absent fields and fetch failures are **unknown**. A clique’s shared affiliation is reported only when every member has usable data. These descriptive clique names and shared affiliations do not establish official or simultaneous team rosters. Use `--all` to include every network character for the homophily test.

Experiment 04’s network switch compares undirected cliques (a reference in either direction suffices) with complete directed cliques (both references must exist for every pair). The snapshot contains six undirected cliques of eight members with 28 connections each, and three directed cliques of five members with 20 arrows each. Shared-core highlighting and team intersections are recalculated for the selected view. To update both clique views without rerunning other experiments:

```sh
python3 tools/generate_week3_data.py --cliques-only
```

The normal Week 03 generator also produces both views. After changing the network, rerun the affiliation scraper to cover the union of their members.


Experiment 04 also compares network-wide team overlap with 1,000 rewired replicas in each view. Regenerate its metadata and analysis in this order:

```sh
python3 tools/scrape_week3_teams.py --all --cache-dir /tmp/week3-team-articles
python3 tools/generate_week3_homophily.py
python3 -m unittest discover -s tools -p 'test_week3_homophily.py'
```

The scraper defaults to one worker and pauses between downloads. Cached articles avoid repeated requests. Missing fields and download failures remain unknown and their reasons are stored. The score is shared-affiliation edges divided by eligible edges, where both endpoints must have at least one recorded affiliation. Unknown characters remain in the complete graph during rewiring. The same fixed eligibility rule is reapplied in every replica; eligible-edge counts can change and are reported.

The null uses independently seeded replicas with 20 attempted edge swaps per edge, rejecting proposals that create self-links or duplicate edges. Undirected proposals preserve every degree. Directed proposals exchange targets to preserve every in-degree and out-degree, and additionally propose directed 3-cycle reversals. Connectivity and reciprocity are not constrained. The baseline is an approximate rewiring distribution, with no claim of proven convergence. The JSON records the seed, attempted-swap settings, successful-swap range, all scores, coverage, the central 95% null interval, metadata checksum, and one-sided empirical p-value `(1 + scores >= observed) / (1000 + 1)`. The result describes overlap among scraped infobox affiliations (including historical versions and organizations), not current simultaneous membership or social preference. Results are hidden if the metadata snapshot has been regenerated without updating the homophily snapshot.
