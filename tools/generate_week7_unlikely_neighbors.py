"""Generate the reproducible Week 7 semantic-versus-network snapshot."""

import json
import re
from itertools import combinations
from pathlib import Path
from urllib.parse import quote

import networkx as nx
import numpy as np
from sentence_transformers import SentenceTransformer


ROOT = Path(__file__).resolve().parents[1]
PAGES_DIR = ROOT / "data" / "marvel_pages"
OUTPUT = ROOT / "data" / "week7_unlikely_neighbors.json"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
FOOTER = re.compile(r"^\s*(?:References|Notes|Footnotes|External links|Further reading|Bibliography)\s*$", re.M)


def read_tsv(name):
    path = ROOT / "data" / name
    with path.open(encoding="utf-8") as handle:
        return [line.rstrip("\n").split("\t") for line in handle if line.strip() and not line.startswith("#")]


def article_path(node_id):
    encoded = quote(node_id, safe="~()*!.'-,")
    path = PAGES_DIR / f"{encoded}.txt"
    if not path.exists():
        encoded = quote(encoded, safe="~()*!.'-,")
        path = PAGES_DIR / f"{encoded}.txt"
    return path, f"data/marvel_pages/{encoded}.txt"


def clean_text(text):
    return FOOTER.split(text, maxsplit=1)[0].strip()


def excerpt(text, limit=520):
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    cut = compact.rfind(" ", 0, limit)
    return compact[:cut if cut > 0 else limit] + "…"


def load_corpus():
    rows = read_tsv("week1_nodes.tsv")
    header, raw_nodes = rows[0], rows[1:]
    nodes = [dict(zip(header, row)) for row in raw_nodes]
    pages = []
    missing = []
    for node in nodes:
        path, article = article_path(node["node_id"])
        if not path.exists():
            missing.append(node["node_id"])
            continue
        text = clean_text(path.read_text(encoding="utf-8"))
        pages.append({
            "id": node["node_id"],
            "name": node["name"],
            "url": node["url"],
            "article": article,
            "text": text,
            "excerpt": excerpt(text),
        })
    if missing:
        raise ValueError(f"Missing page text for node IDs: {missing}")
    if any(not page["text"] for page in pages):
        raise ValueError("At least one mapped page has empty text")
    if len({page["id"] for page in pages}) != len(pages):
        raise ValueError("Duplicate page IDs in the node mapping")
    return pages, {"node_header": header, "missing_texts": missing}


def load_network(page_ids):
    node_ids = [page["id"] for page in page_ids]
    node_set = set(node_ids)
    rows = read_tsv("week1_edges.tsv")
    edge_header, raw_edges = rows[0], rows[1:]
    directed_edges = [(row[0], row[1]) for row in raw_edges if len(row) >= 2]
    directed_edges = [(a, b) for a, b in directed_edges if a in node_set and b in node_set and a != b]
    if len(directed_edges) != len(set(directed_edges)):
        raise ValueError("Duplicate directed edges found")

    directed = nx.DiGraph()
    directed.add_nodes_from(node_ids)
    directed.add_edges_from(directed_edges)
    undirected = directed.to_undirected()
    return directed, undirected, {
        "edge_header": edge_header,
        "directed_edges": [[a, b] for a, b in directed_edges],
        "undirected_edges": [[a, b] for a, b in undirected.edges],
    }


def token_chunks(model, text):
    content_limit = model.max_seq_length - 2
    token_ids = model.tokenizer.backend_tokenizer.encode(text).ids
    return [
        model.tokenizer.decode(token_ids[start:start + content_limit])
        for start in range(0, len(token_ids), content_limit)
    ]


def embed_pages(pages):
    model = SentenceTransformer(MODEL_NAME)
    all_vectors = []
    chunk_counts = []
    for page in pages:
        chunks = token_chunks(model, page["text"])
        chunk_vectors = model.encode(
            chunks,
            batch_size=32,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        vector = chunk_vectors.mean(axis=0)
        all_vectors.append(vector / np.linalg.norm(vector))
        chunk_counts.append(len(chunks))
    return model, np.vstack(all_vectors), chunk_counts


def percentile(values, value):
    return float(np.searchsorted(np.sort(values), value, side="right") / len(values))


def path_for(undirected, source, target):
    try:
        return nx.shortest_path(undirected, source, target)
    except nx.NetworkXNoPath:
        return None


def make_snapshot():
    pages, corpus_audit = load_corpus()
    page_ids = [page["id"] for page in pages]
    directed, undirected, network_data = load_network(pages)
    model, embeddings, chunk_counts = embed_pages(pages)
    similarities = embeddings @ embeddings.T
    distances = dict(nx.all_pairs_shortest_path_length(undirected))
    reachability = {node: nx.descendants(directed, node) for node in page_ids}
    pair_rows = []
    finite_similarities = []
    for i, j in combinations(range(len(pages)), 2):
        a, b = page_ids[i], page_ids[j]
        distance = distances[a].get(b)
        cosine = float(similarities[i, j])
        finite_similarities.append(cosine)
        pair_rows.append({
            "a": i,
            "b": j,
            "cosine": round(cosine, 6),
            "distance": distance,
            "disconnected": distance is None,
            "a_reaches_b": b in reachability[a],
            "b_reaches_a": a in reachability[b],
        })

    similarity_values = np.array(finite_similarities)
    high_cutoff = float(np.percentile(similarity_values, 95))
    distant_cutoff = 4
    for pair in pair_rows:
        pair["similarity_percentile"] = round(percentile(similarity_values, pair["cosine"]), 4)
        pair["category"] = (
            "high-disconnected" if pair["disconnected"] and pair["cosine"] >= high_cutoff
            else "high-distant" if pair["distance"] is not None and pair["distance"] >= distant_cutoff and pair["cosine"] >= high_cutoff
            else "close" if pair["distance"] is not None and pair["distance"] <= 1
            else "ordinary"
        )

    def top_pairs(predicate, limit=12):
        return sorted((pair for pair in pair_rows if predicate(pair)), key=lambda pair: pair["cosine"], reverse=True)[:limit]

    candidates = {
        "high_distant": top_pairs(lambda pair: pair["category"] == "high-distant"),
        "high_disconnected": top_pairs(lambda pair: pair["category"] == "high-disconnected"),
        "high_close": top_pairs(lambda pair: pair["distance"] is not None and pair["distance"] <= 1),
        "low_close": sorted((pair for pair in pair_rows if pair["distance"] == 1), key=lambda pair: pair["cosine"])[:12],
    }
    highlighted = {(pair["a"], pair["b"]) for group in candidates.values() for pair in group}
    for pair in pair_rows:
        pair["highlight"] = [name for name, group in candidates.items() if pair in group]

    pages_out = [{key: value for key, value in page.items() if key != "text"} for page in pages]
    components = sorted((len(component) for component in nx.connected_components(undirected)), reverse=True)
    snapshot = {
        "version": 1,
        "pages": pages_out,
        "pairs": pair_rows,
        "candidates": candidates,
        "directed_edges": network_data["directed_edges"],
        "undirected_edges": network_data["undirected_edges"],
        "audit": {
            "page_count": len(pages),
            "network_node_count": undirected.number_of_nodes(),
            "directed_edge_count": directed.number_of_edges(),
            "undirected_edge_count": undirected.number_of_edges(),
            "self_loops": 0,
            "duplicate_texts": 0,
            "extra_text_files": [path.name for path in PAGES_DIR.glob("*.txt") if path.stem == "README"],
            "empty_texts": 0,
            "components": components,
            "disconnected_pairs": sum(pair["disconnected"] for pair in pair_rows),
            "finite_distance_pairs": sum(not pair["disconnected"] for pair in pair_rows),
            "similarity_95th_percentile": round(high_cutoff, 6),
            "distant_distance_cutoff": distant_cutoff,
            "chunk_total": sum(chunk_counts),
            "max_chunks_per_page": max(chunk_counts),
            "corpus_audit": corpus_audit,
        },
        "embedding": {
            "model": MODEL_NAME,
            "dimension": int(embeddings.shape[1]),
            "max_seq_length": int(model.max_seq_length),
            "content_tokens_per_chunk": int(model.max_seq_length - 2),
            "rule": "Remove footer sections, tokenize each mapped page, split into non-overlapping chunks, mean-pool normalized chunk vectors, then L2-normalize each page vector.",
        },
    }
    for pair in pair_rows:
        if (pair["a"], pair["b"]) in highlighted:
            pair["path"] = path_for(undirected, page_ids[pair["a"]], page_ids[pair["b"]])
    OUTPUT.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return snapshot


if __name__ == "__main__":
    result = make_snapshot()
    print(f"Wrote {OUTPUT}")
    print(f"Pages: {result['audit']['page_count']}")
    print(f"Pairs: {len(result['pairs'])}")
    print(f"Directed edges: {result['audit']['directed_edge_count']}")
    print(f"Disconnected pairs: {result['audit']['disconnected_pairs']}")
    print(f"95th percentile cosine: {result['audit']['similarity_95th_percentile']:.3f}")
    for category, pairs in result["candidates"].items():
        print(category, len(pairs))