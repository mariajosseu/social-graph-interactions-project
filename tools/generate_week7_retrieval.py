"""Week 7 Question 6: compare sparse (BM25) and dense (MiniLM) retrieval over the 303 Marvel pages."""

import json
import math
import re
from collections import Counter

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from generate_week7_unlikely_neighbors import MODEL_NAME, ROOT, excerpt, load_corpus, token_chunks

OUTPUT = ROOT / "data" / "week7_retrieval.json"
TOKEN = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")
SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“'(])")
TOP_K = 5
K1, B = 1.5, 0.75

# Each query isolates one way the two representations can disagree.
QUERIES = [
    ("rare-name", "Wakanda", "A rare exact word: sparse retrieval should be at home."),
    ("rare-name", "Asgard", "Another exact place name that many unrelated pages use in passing."),
    ("paraphrase", "a hero who lost his memory and does not know who he is", "Amnesia is the concept; the pages may never say “lost his memory”."),
    ("paraphrase", "a teenager who gets spider-like abilities after an accident", "A description with no character names."),
    ("vocabulary", "artificial intelligence that becomes self-aware", "Pages may say android, robot, sentient or synthezoid instead."),
    ("vocabulary", "controls the weather", "Concept words (storm, lightning, climate) may replace “weather”."),
    ("negation", "heroes who are not human", "Sparse sees “human” and dense may see the concept; neither handles “not” reliably."),
    ("history", "fought Nazis in World War II", "Event described in many wordings across many pages."),
]


# Written after reading the returned snippets and pages, not computed.
VERDICTS = {
    "Wakanda": ("sparse", "Ranks 1–2 agree. Sparse’s other three hits (Storm, John Jameson, Doom 2099) really mention Wakanda; dense fills places 3–5 with Dragon Lord, Gwenpool and Silhouette, whose snippets are not about Wakanda."),
    "Asgard": ("tie", "Both find Fandral, Balder and Hrimhari. Sparse adds Beta Ray Bill and Thor Girl, both Asgard stories; dense adds Ares (the Siege of Asgard) but also Blackwulf, whose snippet does not mention it."),
    "a hero who lost his memory and does not know who he is": ("neither", "No overlap and no page about amnesia. Sparse matches “know”, “lost” and “who” in unrelated sentences; dense returns generic hero pages. Either the corpus rarely says this or both representations miss it."),
    "a teenager who gets spider-like abilities after an accident": ("dense", "Dense returns five spider-themed pages (Spider-Man, Steel Spider, Mayday Parker, Silk, Gwen Stacy). Sparse matches filler words (“gets”, “abilities”, “accident”) and surfaces Bob, Black Cat and the Hulk."),
    "artificial intelligence that becomes self-aware": ("dense", "Dense finds Machine Man (robots achieving sentience) and Iron Lad (Vision’s software), though it also returns noise (Nightmask, Bird-Brain). Sparse is mostly noise apart from Baymax and Human Torch (android)."),
    "controls the weather": ("sparse", "Both rank Storm first. Sparse’s next hits (Straw Man, Dargo Ktor, Thor Girl) literally say “control the weather”. Dense drifts to other elemental control, such as Human Torch controlling fire."),
    "heroes who are not human": ("neither", "Neither understands “not”. Dense’s Human Torch (android) is a good hit that sparse also finds, but sparse reaches Human Torch through the word “human” in the name and then returns pages that are simply about humans."),
    "fought Nazis in World War II": ("dense", "Dense finds Blue Bullet, Spitfire, Citizen V and Shear, all World War II characters. Sparse gets Blue Bullet and Junior Juniper but also vague matches such as Spider-Man Noir."),
}


def tokens(text):
    return [t for t in TOKEN.findall(text.lower()) if t not in ENGLISH_STOP_WORDS]


class BM25:
    def __init__(self, docs):
        self.tf = [Counter(d) for d in docs]
        self.len = np.array([len(d) for d in docs], dtype=float)
        self.avg = self.len.mean()
        df = Counter(t for d in self.tf for t in d)
        n = len(docs)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}

    def scores(self, query_tokens):
        out = np.zeros(len(self.tf))
        for t in set(query_tokens):
            if t not in self.idf:
                continue
            for i, tf in enumerate(self.tf):
                f = tf.get(t, 0)
                if f:
                    out[i] += self.idf[t] * f * (K1 + 1) / (f + K1 * (1 - B + B * self.len[i] / self.avg))
        return out


def best_sentence_by_terms(text, terms):
    best, best_hits = None, 0
    for sentence in SENTENCE.split(text):
        hits = len(terms & set(tokens(sentence)))
        if hits > best_hits:
            best, best_hits = sentence, hits
    return (best or ""), best_hits


def main():
    pages, _ = load_corpus()
    bm25 = BM25([tokens(p["text"]) for p in pages])
    model = SentenceTransformer(MODEL_NAME)
    chunk_vectors, chunk_owner, chunk_text = [], [], []
    for index, page in enumerate(pages):
        chunks = token_chunks(model, page["text"])
        # A tiny tail chunk (a word or two) embeds as noise and can win on any query.
        long_chunks = [c for c in chunks if len(c.split()) >= 30]
        chunks = long_chunks or chunks[:1]
        vecs = model.encode(chunks, batch_size=32, normalize_embeddings=True, show_progress_bar=False)
        chunk_vectors.append(vecs)
        chunk_owner += [index] * len(chunks)
        chunk_text += chunks
    matrix = np.vstack(chunk_vectors)
    owner = np.array(chunk_owner)

    results = []
    for kind, query, note in QUERIES:
        q_tokens = tokens(query)
        sparse = bm25.scores(q_tokens)
        qv = model.encode([query], normalize_embeddings=True)[0]
        sims = matrix @ qv
        dense = np.full(len(pages), -1.0)
        best_chunk = {}
        for i, (o, s) in enumerate(zip(owner, sims)):
            if s > dense[o]:
                dense[o], best_chunk[o] = s, i
        sparse_rank = list(np.argsort(-sparse, kind="stable"))
        dense_rank = list(np.argsort(-dense, kind="stable"))
        s_pos = {int(i): r + 1 for r, i in enumerate(sparse_rank)}
        d_pos = {int(i): r + 1 for r, i in enumerate(dense_rank)}
        terms = set(q_tokens)

        sparse_hits = []
        for i in sparse_rank[:TOP_K]:
            sentence, hits = best_sentence_by_terms(pages[i]["text"], terms)
            sparse_hits.append({
                "id": pages[i]["id"], "name": pages[i]["name"], "score": round(float(sparse[i]), 3),
                "otherRank": d_pos[int(i)], "snippet": re.sub(r"\s+", " ", sentence).strip()[:320],
                "matched": sorted(terms & set(tokens(pages[i]["text"]))),
            })
        dense_hits = []
        for i in dense_rank[:TOP_K]:
            sentences = [s for s in SENTENCE.split(pages[i]["text"]) if len(s.split()) > 3] or [pages[i]["text"]]
            sv = model.encode(sentences, normalize_embeddings=True, show_progress_bar=False)
            sentence = sentences[int(np.argmax(sv @ qv))]
            dense_hits.append({
                "id": pages[i]["id"], "name": pages[i]["name"], "score": round(float(dense[i]), 3),
                "otherRank": s_pos[int(i)], "snippet": re.sub(r"\s+", " ", sentence).strip()[:320],
                "matched": sorted(terms & set(tokens(pages[i]["text"]))),
            })
        overlap = len({h["id"] for h in sparse_hits} & {h["id"] for h in dense_hits})
        results.append({
            "kind": kind, "query": query, "note": note, "winner": VERDICTS[query][0], "verdict": VERDICTS[query][1], "overlap": overlap,
            "matchingPages": int((sparse > 0).sum()),
            "sparse": sparse_hits, "dense": dense_hits,
        })

    OUTPUT.write_text(json.dumps({
        "version": 1, "topK": TOP_K, "model": MODEL_NAME, "pages": len(pages),
        "sparse": f"BM25 (k1={K1}, b={B}), lowercase tokens, English stop words removed, no stemming",
        "dense": "Max cosine similarity between the query and any ~254-token chunk of the page",
        "queries": results,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    for r in results:
        print("\n##", r["query"], "overlap", r["overlap"], "matching pages", r["matchingPages"])
        for label in ("sparse", "dense"):
            print(" ", label)
            for h in r[label]:
                print("   ", h["name"], h["score"], "other rank", h["otherRank"], "|", h["snippet"][:110])


if __name__ == "__main__":
    main()
