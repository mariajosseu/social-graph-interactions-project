# Week 7 / Question 4: story arcs

Open `week-07.html#question-4` through the project's local HTTP server. The page
uses `data/week7_arcs.json`; no model runs in the browser.

## Regenerate

Use a separate Python 3.9–3.11 environment. The tested package versions are in
`requirements-week7-arcs.txt`. Run from the repository root:

```sh
python3 -m pip install -r tools/requirements-week7-arcs.txt
python3 -S tools/collect_week7_fanfiction.py
python3 -S tools/prepare_week7_models.py
USE_TF=0 USE_FLAX=0 TOKENIZERS_PARALLELISM=false python3 tools/generate_week7_arcs.py
python3 tools/test_week7_arcs.py
```

Acquisition reads the 45 MB ZIP index and selected compressed members using HTTP
byte ranges, rather than downloading the full 4 GB archive. Full texts and model
files stay in `/private/tmp/week7-arcs` and `/private/tmp/week7-model`.

## Sample

Source: the public [archived FanFiction.net collection](https://archive.org/details/fanfictiondotnet_repack),
member `Fanfiction_A.zip`, category `Avengers/Completed`.

Candidates are sorted by archive path, then shuffled with seed 42. Retain the first
36 eligible works, at most one per author. Eligibility requires English, completed,
one chapter, K/K+/T rating, a 12–60 kB archived text, and 2,000–8,000 words after
cleanup. A Marvel character-name check excludes unrelated British-TV Avengers
fiction; an explicit “complete until further notice” note is excluded too.

Generic cleanup removes headers, title lines, separator lines and marked notes.
Boundary review then removes remaining opening/closing notes. `week7_story_cleanup.json`
records paragraph boundaries and content hashes for those adjustments, applied
before the final word-count check. Unexpected source changes fail the hash check
instead of silently applying offsets to a different text. Internal unmarked notes
may remain. The archive's completion labels are imperfect, and this historical
convenience sample is not representative of all Marvel fan fiction.

## Measurements

- Negativity: SST-2 DistilBERT's P(negative); maximum 512 word pieces per sentence.
- Anger proxy: DeepMoji emoji classes 32 (😡) and 55 (😠), fixed before inference;
  maximum 80 tokens per sentence. The legacy implementation is vendored under MIT;
  compatibility changes are documented in `vendor/torchmoji/PROVENANCE.md`.
- Centered moving averages: 3%, 5% or 10% of sentences, shortened at boundaries,
  then linearly interpolated onto 100 narrative positions.
- Clustering: standardized positive-up valence (`1 − 2 × negativity`), k-means,
  k=2…8, `n_init=20`, seeds 42/17/91. Silhouette describes separation; adjusted Rand
  index describes seed and smoothing stability.
- Sketch names: the closest of six idealized curves by correlation. These are
  descriptive similarities, not independently validated narrative labels.
- Anger–negativity correlation: descriptive Pearson r over the 100 smoothed
  positions. The positions are dependent; no inferential p-values are reported.
- Source excerpts: highest-scoring sentences within the 5% negativity, anger and
  relative-mismatch windows, each capped at 24 words plus an ellipsis.

The JSON records original titles, authors, URLs, dates, content hashes, model
revisions, input truncation counts, all sentence scores and package versions.
Per-story and per-sentence inference checkpoints are cached locally so boundary
corrections can reuse unchanged sentence predictions. Bump the score-cache version
if the models, emoji group or tokenization change.
