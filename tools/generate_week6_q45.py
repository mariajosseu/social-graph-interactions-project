"""Generate additive Week 6 Question 4/5 data without touching the Q1-Q3 snapshot."""
import json
import re
from collections import Counter
from itertools import combinations
from pathlib import Path
from urllib.parse import quote

import networkx as nx
import numpy as np
from scipy.sparse import coo_matrix
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import normalize

ROOT = Path(__file__).resolve().parents[1]
FOOTER = r'^\s*(?:References|Notes|Footnotes|External links|Further reading|Bibliography)\s*$'
STOP = set(ENGLISH_STOP_WORDS) | {'marvel', 'comics', 'comic', 'character', 'characters', 'issue', 'series', 'first', 'appeared'}
TOKEN = r'(?u)\b[a-zA-Z][a-zA-Z]{2,}\b'
WINDOW = 4
MIN_COUNT = 4
MAX_VOCAB = 400
QUERY_WORDS = ('hammer', 'shield', 'storm', 'vampire', 'mutant', 'magic', 'symbiote', 'agent', 'school', 'space')


def read_tsv(name):
    with (ROOT / 'data' / name).open() as handle:
        return [line.rstrip('\n').split('\t') for line in handle if line.strip() and not line.startswith('#')]


def load():
    header, *rows = read_tsv('week1_nodes.tsv')
    nodes = [dict(zip(header, row)) for row in rows]
    texts = []
    for node in nodes:
        encoded = quote(node['node_id'], safe="~()*!.'-,")
        path = ROOT / 'data/marvel_pages' / f'{encoded}.txt'
        if not path.exists():
            encoded = quote(encoded, safe="~()*!.'-,")
            path = ROOT / 'data/marvel_pages' / f'{encoded}.txt'
        node['article'] = f'data/marvel_pages/{encoded}.txt'
        texts.append(re.split(FOOTER, path.read_text(), maxsplit=1, flags=re.M)[0])
    return nodes, texts


def tokens(text):
    return re.findall(TOKEN, text.lower())


def build_vectors(texts):
    pages = [tokens(text) for text in texts]
    counts = Counter(word for page in pages for word in page if word not in STOP)
    vocabulary = sorted((word for word, count in counts.items() if count >= MIN_COUNT), key=lambda word: (-counts[word], word))[:MAX_VOCAB]
    index = {word: i for i, word in enumerate(vocabulary)}
    rows, columns, values = [], [], []
    for page in pages:
        for position, word in enumerate(page):
            if word not in index:
                continue
            for neighbour in page[max(0, position - WINDOW):position] + page[position + 1:position + WINDOW + 1]:
                if neighbour in index and neighbour != word:
                    rows.append(index[word])
                    columns.append(index[neighbour])
                    values.append(1)
    matrix = coo_matrix((values, (rows, columns)), shape=(len(vocabulary), len(vocabulary))).tocsr()
    raw = normalize(matrix, norm='l2', axis=1)
    totals = float(matrix.sum())
    row_totals = np.asarray(matrix.sum(axis=1)).ravel()
    column_totals = np.asarray(matrix.sum(axis=0)).ravel()
    coo = matrix.tocoo()
    values = np.log2((coo.data * totals) / (row_totals[coo.row] * column_totals[coo.col]))
    values = np.maximum(values, 0)
    ppmi = coo_matrix((values, (coo.row, coo.col)), shape=matrix.shape).tocsr()
    ppmi = normalize(ppmi, norm='l2', axis=1)
    return pages, vocabulary, index, raw, ppmi


def neighbours(vectors, vocabulary, index, word, limit=8):
    if word not in index:
        return []
    scores = vectors[index[word]].dot(vectors.T).toarray().ravel()
    scores[index[word]] = -1
    order = np.argsort(-scores)[:limit]
    return [dict(word=vocabulary[i], cosine=round(float(scores[i]), 4)) for i in order if scores[i] > 0]


def excerpts(texts, target, neighbour, limit=3):
    target_pattern = re.compile(rf'\b{re.escape(target)}\b', re.I)
    neighbour_pattern = re.compile(rf'\b{re.escape(neighbour)}\b', re.I)
    result = []
    for page, text in enumerate(texts):
        for sentence in re.split(r'(?<=[.!?])\s+', text.replace('\n', ' ')):
            if target_pattern.search(sentence):
                result.append(dict(page=page, text=re.sub(r'\s+', ' ', sentence.strip())[:360], both=bool(neighbour_pattern.search(sentence))))
                if len(result) == limit:
                    return result
    return result


def build_graph(nodes):
    ids = [node['node_id'] for node in nodes]
    graph = nx.Graph()
    graph.add_nodes_from(ids)
    for row in read_tsv('week1_edges.tsv'):
        if len(row) >= 2 and row[0] in graph and row[1] in graph and row[0] != row[1]:
            graph.add_edge(row[0], row[1])
    return graph


def main():
    nodes, texts = load()
    pages, vocabulary, index, raw, ppmi = build_vectors(texts)
    selected = [word for word in QUERY_WORDS if word in index]
    if len(selected) < 6:
        selected += [word for word in vocabulary if word not in selected][:6 - len(selected)]
    q4_words = []
    for word in selected:
        raw_rows = neighbours(raw, vocabulary, index, word)
        ppmi_rows = neighbours(ppmi, vocabulary, index, word)
        all_words = sorted({row['word'] for row in raw_rows + ppmi_rows})
        pairs = []
        for neighbour in all_words:
            pair = dict(word=neighbour,
                        raw=round(float(raw[index[word]].dot(raw[index[neighbour]].T).toarray()[0, 0]), 4),
                        ppmi=round(float(ppmi[index[word]].dot(ppmi[index[neighbour]].T).toarray()[0, 0]), 4),
                        excerpts=excerpts(texts, word, neighbour) if len(pairs) < 3 else [])
            pairs.append(pair)
        q4_words.append(dict(word=word, raw=raw_rows, ppmi=ppmi_rows, pairs=pairs))

    tfidf = TfidfVectorizer(sublinear_tf=True, stop_words=sorted(STOP), token_pattern=TOKEN, min_df=2)
    documents = tfidf.fit_transform(texts)
    feature_names = tfidf.get_feature_names_out()
    page_vectors = np.zeros((len(texts), len(vocabulary)))
    for page_index, row in enumerate(documents):
        for column, weight in zip(row.indices, row.data):
            word = feature_names[column]
            if word in index:
                page_vectors[page_index] += weight * ppmi[index[word]].toarray().ravel()
    page_vectors = normalize(page_vectors, norm='l2', axis=1)
    tfidf_similarity = cosine_similarity(documents)
    ppmi_similarity = cosine_similarity(page_vectors)
    graph = build_graph(nodes)
    distances = dict(nx.all_pairs_shortest_path_length(graph))
    ids = [node['node_id'] for node in nodes]
    q5_pages = []
    for page_index in range(len(nodes)):
        tfidf_order = [i for i in np.argsort(-tfidf_similarity[page_index]) if i != page_index][:8]
        ppmi_order = [i for i in np.argsort(-ppmi_similarity[page_index]) if i != page_index][:8]
        q5_pages.append(dict(
            overlap=round(len(set(tfidf_order[:5]) & set(ppmi_order[:5])) / 5, 3),
            tfidf=[dict(page=int(i), cosine=round(float(tfidf_similarity[page_index, i]), 4), distance=distances[ids[page_index]].get(ids[i])) for i in tfidf_order],
            ppmi=[dict(page=int(i), cosine=round(float(ppmi_similarity[page_index, i]), 4), distance=distances[ids[page_index]].get(ids[i])) for i in ppmi_order]))
    data = dict(version=1, window=WINDOW, minCount=MIN_COUNT, vocabularySize=len(vocabulary),
                words=q4_words, pages=q5_pages, meanOverlap=round(float(np.mean([page['overlap'] for page in q5_pages])), 3),
                disagreement=[int(i) for i, _ in sorted(enumerate(q5_pages), key=lambda item: item[1]['overlap'])[:10]])
    (ROOT / 'data/week6_q45.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
    print('Q4 words:', ', '.join(selected))
    print('Q5 pages:', len(q5_pages), 'mean overlap:', data['meanOverlap'])


if __name__ == '__main__':
    main()
