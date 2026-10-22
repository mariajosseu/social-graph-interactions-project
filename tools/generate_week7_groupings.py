"""Generate the Week 7 comparison of LDA topics, embedding clusters, and communities."""

import json
from collections import Counter
from pathlib import Path

import networkx as nx
import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics import adjusted_mutual_info_score, silhouette_score

from generate_week7_unlikely_neighbors import embed_pages, load_corpus, load_network


ROOT = Path(__file__).resolve().parents[1]
LDA_SNAPSHOT = ROOT / "data" / "week6_questions.json"
OUTPUT = ROOT / "data" / "week7_groupings.json"
CLUSTER_COUNT = 8
STOP = sorted(ENGLISH_STOP_WORDS | {"marvel", "comics", "comic", "character", "characters", "issue", "series", "first", "appeared"})
TOKEN = r"(?u)\b[a-zA-Z][a-zA-Z]{2,}\b"


def excerpt(text, limit=520):
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    cut = compact.rfind(" ", 0, limit)
    return compact[:cut if cut > 0 else limit] + "…"


def load_lda():
    data = json.loads(LDA_SNAPSHOT.read_text(encoding="utf-8"))
    pages = {page["name"]: page for page in data["q3"]["pages"]}
    topics = data["q3"]["topics"]
    return pages, topics


def community_data(pages, undirected):
    communities = sorted(nx.community.louvain_communities(undirected, seed=42), key=lambda group: (-len(group), sorted(group)[0]))
    ids = {node_id: community_id for community_id, group in enumerate(communities) for node_id in group}
    output = []
    for community_id, group in enumerate(communities):
        leaders = sorted(group, key=lambda node_id: (-undirected.degree(node_id), node_id))[:5]
        output.append({
            "id": community_id,
            "size": len(group),
            "leaders": [pages[index]["name"] for index in [next(i for i, page in enumerate(pages) if page["id"] == node_id) for node_id in leaders]],
        })
    return ids, output


def cluster_terms(texts, labels):
    vectorizer = TfidfVectorizer(stop_words=STOP, token_pattern=TOKEN, min_df=2, sublinear_tf=True)
    matrix = vectorizer.fit_transform(texts)
    terms = np.array(vectorizer.get_feature_names_out())
    output = []
    for cluster_id in range(CLUSTER_COUNT):
        rows = matrix[np.array(labels) == cluster_id]
        mean = np.asarray(rows.mean(axis=0)).ravel()
        top = np.argsort(-mean)[:8]
        output.append([terms[index] for index in top if mean[index] > 0])
    return output


def main():
    pages, _ = load_corpus()
    directed, undirected, network_data = load_network(pages)
    lda_pages, lda_topics = load_lda()
    model, embeddings, chunk_counts = embed_pages(pages)
    texts = [page["text"] for page in pages]
    names = [page["name"] for page in pages]

    missing_lda = [name for name in names if name not in lda_pages]
    if missing_lda:
        raise ValueError(f"LDA snapshot is missing pages: {missing_lda}")

    kmeans = KMeans(n_clusters=CLUSTER_COUNT, random_state=42, n_init=50)
    embedding_labels = kmeans.fit_predict(embeddings)
    pca_xy = PCA(n_components=2, random_state=42).fit_transform(embeddings)
    community_ids, communities = community_data(pages, undirected)
    term_lists = cluster_terms(texts, embedding_labels)
    nearest = np.argsort(-(embeddings @ embeddings.T), axis=1)[:, 1:6]
    silhouette = float(silhouette_score(embeddings, embedding_labels, metric="cosine"))

    page_records = []
    for index, page in enumerate(pages):
        lda = lda_pages[page["name"]]
        distribution = [round(float(value), 4) for value in lda["theta"]]
        neighbors = [
            {"index": int(neighbor), "cosine": round(float(embeddings[index] @ embeddings[neighbor]), 4)}
            for neighbor in nearest[index]
        ]
        page_records.append({
            "id": page["id"],
            "name": page["name"],
            "url": page["url"],
            "article": page["article"],
            "excerpt": excerpt(page["text"]),
            "pca": [round(float(value), 6) for value in pca_xy[index]],
            "lda": {"topic": int(lda["top"][0]), "probability": round(float(distribution[lda["top"][0]]), 4), "distribution": distribution},
            "embedding_cluster": int(embedding_labels[index]),
            "community": int(community_ids[page["id"]]),
            "neighbors": neighbors,
            "chunk_count": chunk_counts[index],
        })

    cross_counts = Counter((page["lda"]["topic"], page["embedding_cluster"]) for page in page_records)
    disagreements = []
    for page_index, page in enumerate(page_records):
        pair_count = cross_counts[(page["lda"]["topic"], page["embedding_cluster"])]
        if pair_count <= 3 or page["lda"]["probability"] < .55:
            disagreements.append({
                "page": page_index,
                "lda_topic": page["lda"]["topic"],
                "embedding_cluster": page["embedding_cluster"],
                "community": page["community"],
                "lda_probability": page["lda"]["probability"],
                "combination_count": pair_count,
            })
    disagreements.sort(key=lambda row: (row["combination_count"], row["lda_probability"]))

    cluster_records = []
    for cluster_id in range(CLUSTER_COUNT):
        members = [index for index, page in enumerate(page_records) if page["embedding_cluster"] == cluster_id]
        centroid_distances = [(float(np.linalg.norm(embeddings[index] - kmeans.cluster_centers_[cluster_id])), index) for index in members]
        representatives = [index for _, index in sorted(centroid_distances)[:5]]
        cluster_records.append({"id": cluster_id, "size": len(members), "terms": term_lists[cluster_id], "representatives": representatives})

    ami_lda_embedding = adjusted_mutual_info_score([page["lda"]["topic"] for page in page_records], embedding_labels)
    ami_lda_network = adjusted_mutual_info_score([page["lda"]["topic"] for page in page_records], [page["community"] for page in page_records])
    ami_embedding_network = adjusted_mutual_info_score(embedding_labels, [page["community"] for page in page_records])
    snapshot = {
        "version": 1,
        "pages": page_records,
        "lda_topics": [{"id": index, "terms": terms} for index, terms in enumerate(lda_topics)],
        "embedding_clusters": cluster_records,
        "communities": communities,
        "disagreements": disagreements[:30],
        "edges": network_data["undirected_edges"],
        "comparison": {
            "page_count": len(pages),
            "lda_topic_count": len(lda_topics),
            "embedding_cluster_count": CLUSTER_COUNT,
            "network_community_count": len(communities),
            "embedding_silhouette_cosine": round(silhouette, 4),
            "ami_lda_embedding": round(float(ami_lda_embedding), 4),
            "ami_lda_network": round(float(ami_lda_network), 4),
            "ami_embedding_network": round(float(ami_embedding_network), 4),
            "embedding_model": model.__class__.__name__ + ": all-MiniLM-L6-v2",
            "embedding_rule": "Same token-aware chunking and mean pooling as the Week 7 corpus atlas.",
            "lda_source": "Week 6 q3 snapshot: 8 topics, seeded LDA, existing preprocessing.",
            "network_source": "Week 1 directed hyperlink graph, converted to undirected for Louvain communities.",
        },
    }
    OUTPUT.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"Pages: {len(pages)}")
    print(f"LDA topics: {len(lda_topics)}")
    print(f"Embedding clusters: {CLUSTER_COUNT}, silhouette: {silhouette:.3f}")
    print(f"Network communities: {len(communities)}")
    print(f"AMI LDA / embedding / network: {ami_lda_embedding:.3f} / {ami_lda_network:.3f} / {ami_embedding_network:.3f}")


if __name__ == "__main__":
    main()