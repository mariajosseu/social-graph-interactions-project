"""Week 06 snapshot: textual vs network distance, community language, LDA bridges."""
import csv
import json
import math
import random
import re
from collections import Counter
from itertools import combinations
from pathlib import Path
from urllib.parse import quote

import networkx as nx
import numpy as np
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer, TfidfVectorizer

ROOT = Path(__file__).resolve().parents[1]
FOOTER = r'^\s*(?:References|Notes|Footnotes|External links|Further reading|Bibliography)\s*$'
STOP = sorted(ENGLISH_STOP_WORDS | {'marvel', 'comics', 'comic', 'character', 'characters', 'issue', 'series', 'first', 'appeared'})
TOKEN = r'(?u)\b[a-zA-Z][a-zA-Z]{2,}\b'
TOPICS = 8


def read_tsv(name):
    with (ROOT / 'data' / name).open() as handle:
        return [l.rstrip('\n').split('\t') for l in handle if l.strip() and not l.startswith('#')]


def load():
    header, *rows = read_tsv('week1_nodes.tsv')
    nodes = [dict(zip(header, r)) for r in rows]
    texts = []
    for node in nodes:
        encoded = quote(node['node_id'], safe="~()*!.'-,")
        path = ROOT / 'data/marvel_pages' / (encoded + '.txt')
        if not path.exists():
            encoded = quote(encoded, safe="~()*!.'-,")
            path = ROOT / 'data/marvel_pages' / (encoded + '.txt')
        node['article'] = 'data/marvel_pages/' + encoded + '.txt'
        texts.append(re.split(FOOTER, path.read_text(), maxsplit=1, flags=re.M)[0])
    return nodes, texts


def capitalised(texts):
    caps, total = Counter(), Counter()
    for text in texts:
        for m in re.finditer(r'[A-Za-z]+', text):
            before = text[:m.start()].rstrip()
            if not before or before[-1] in '.!?\n':
                continue
            total[m.group().lower()] += 1
            caps[m.group().lower()] += m.group()[0].isupper()
    return {w for w, c in total.items() if c >= 3 and caps[w] / c >= .9}


def question_one(nodes, texts, graph):
    n = len(nodes)
    ids = [x['node_id'] for x in nodes]
    vec = TfidfVectorizer(sublinear_tf=True, stop_words=STOP, token_pattern=TOKEN, min_df=2)
    matrix = vec.fit_transform(texts)
    sim = (matrix @ matrix.T).toarray()
    terms = np.array(vec.get_feature_names_out())
    dist = dict(nx.all_pairs_shortest_path_length(graph))
    buckets = {}
    pairs = []
    for i, j in combinations(range(n), 2):
        d = dist[ids[i]].get(ids[j])
        key = 'none' if d is None else str(min(d, 5))
        buckets.setdefault(key, []).append(sim[i, j])
        if d is None or d >= 4:
            pairs.append((sim[i, j], i, j, d))
    pairs.sort(reverse=True)
    stats = [dict(key=k, pairs=len(v), mean=round(float(np.mean(v)), 4), p99=round(float(np.percentile(v, 99)), 4)) for k, v in sorted(buckets.items())]
    out = []
    used = Counter()
    for score, i, j, d in pairs:
        if used[i] >= 2 or used[j] >= 2:
            continue
        used[i] += 1
        used[j] += 1
        contribution = matrix[i].multiply(matrix[j]).toarray()[0]
        top = np.argsort(-contribution)[:6]
        out.append(dict(a=i, b=j, cosine=round(float(score), 4), distance=d, terms=[dict(term=terms[t], weight=round(float(contribution[t]), 4)) for t in top]))
        if len(out) == 15:
            break
    return dict(buckets=stats, pairs=out)


def question_two(nodes, texts, graph):
    ids = [x['node_id'] for x in nodes]
    index = {k: i for i, k in enumerate(ids)}
    comms = sorted(nx.community.louvain_communities(graph, seed=42), key=len, reverse=True)
    big = [sorted(index[x] for x in c) for c in comms if len(c) >= 10]
    caps = capitalised(texts)
    vec = CountVectorizer(stop_words=STOP, token_pattern=TOKEN, min_df=3)
    counts = vec.fit_transform(texts).toarray().astype(float)
    terms = np.array(vec.get_feature_names_out())
    nameless = np.array([t not in caps for t in terms])
    rng = random.Random(7)
    train, test = {}, {}
    for k, members in enumerate(big):
        shuffled = members[:]
        rng.shuffle(shuffled)
        cut = max(1, round(len(shuffled) * .3))
        test[k], train[k] = shuffled[:cut], shuffled[cut:]
    background = counts[sum(train.values(), [])].sum(0) + 1
    out = dict(communities=[], pairs={})
    for k, members in enumerate(big):
        degree = sorted(members, key=lambda i: -graph.degree(ids[i]))[:4]
        out['communities'].append(dict(id=k, size=len(members), leaders=[nodes[i]['name'] for i in degree], test=len(test[k])))

    def accuracy(a, b, mask):
        ya, yb = counts[train[a]].sum(0), counts[train[b]].sum(0)
        la = np.log((ya + .1) / (ya.sum() + .1 * len(ya)))
        lb = np.log((yb + .1) / (yb.sum() + .1 * len(yb)))
        right, rows = 0, []
        for label, side in ((a, 'a'), (b, 'b')):
            for i in test[label]:
                v = counts[i] * mask
                score = float(v @ (la - lb)) / max(v.sum(), 1)
                guess = 'a' if score > 0 else 'b'
                right += guess == side
                rows.append(dict(page=i, truth=side, score=round(score, 3), guess=guess))
        return right / len(rows), rows

    full = np.ones(len(terms))
    for a, b in combinations(range(len(big)), 2):
        ya, yb = counts[train[a]].sum(0), counts[train[b]].sum(0)
        a0 = 500
        prior = background / background.sum() * a0
        na, nb = ya.sum(), yb.sum()
        da = np.log((ya + prior) / (na + a0 - ya - prior)) - np.log((yb + prior) / (nb + a0 - yb - prior))
        z = da / np.sqrt(1 / (ya + prior) + 1 / (yb + prior))
        keep = (ya + yb) >= 8
        z = np.where(keep, z, 0)
        top_a = np.argsort(-z)[:12]
        top_b = np.argsort(z)[:12]
        acc, rows = accuracy(a, b, full)
        acc_plain, _ = accuracy(a, b, nameless.astype(float))
        majority = max(len(test[a]), len(test[b])) / (len(test[a]) + len(test[b]))
        out['pairs'][f'{a}-{b}'] = dict(
            a=a, b=b, accuracy=round(acc, 3), accuracyNoNames=round(acc_plain, 3), majority=round(majority, 3),
            termsA=[dict(term=terms[t], z=round(float(z[t]), 2), count=int(ya[t]), name=bool(terms[t] in caps)) for t in top_a],
            termsB=[dict(term=terms[t], z=round(float(-z[t]), 2), count=int(yb[t]), name=bool(terms[t] in caps)) for t in top_b],
            test=rows)
    out['members'] = {str(k): m for k, m in enumerate(big)}
    return out


def entropy(p):
    p = p[p > 0]
    return float(-(p * np.log(p)).sum() / math.log(len(p) if len(p) > 1 else 2))


def question_three(nodes, texts):
    vec = CountVectorizer(stop_words=STOP, token_pattern=TOKEN, min_df=5, max_df=.5)
    counts = vec.fit_transform(texts)
    terms = np.array(vec.get_feature_names_out())
    lda = LatentDirichletAllocation(n_components=TOPICS, random_state=0, learning_method='batch', max_iter=60, doc_topic_prior=.1, topic_word_prior=.01)
    theta = lda.fit_transform(counts)
    topics = [[terms[t] for t in np.argsort(-row)[:10]] for row in lda.components_]
    tokens = np.asarray(counts.sum(1)).ravel()
    halves = []
    for text in texts:
        paragraphs = [p for p in re.split(r'\n\s*\n', text) if p.strip()]
        cut = max(1, len(paragraphs) // 2)
        halves.append(('\n\n'.join(paragraphs[:cut]), '\n\n'.join(paragraphs[cut:]) or paragraphs[-1] if paragraphs else ''))
    first = lda.transform(vec.transform([h[0] for h in halves]))
    second = lda.transform(vec.transform([h[1] for h in halves]))
    ent = np.array([entropy(r) for r in theta])
    pages = []
    for i, node in enumerate(nodes):
        order = np.argsort(-theta[i])
        pages.append(dict(name=node['name'], url=node['url'], article=node['article'], tokens=int(tokens[i]), entropy=round(float(ent[i]), 3),
                          top=[int(order[0]), int(order[1])], theta=[round(float(x), 3) for x in theta[i]],
                          first=[round(float(x), 3) for x in first[i]], second=[round(float(x), 3) for x in second[i]],
                          halfEntropy=[round(entropy(first[i]), 3), round(entropy(second[i]), 3)],
                          halfTop=[int(first[i].argmax()), int(second[i].argmax())]))
    corr = float(np.corrcoef(np.log(tokens), ent)[0, 1])
    return dict(topics=topics, pages=pages, lengthCorrelation=round(corr, 3))


def main():
    nodes, texts = load()
    ids = [x['node_id'] for x in nodes]
    graph = nx.Graph()
    graph.add_nodes_from(ids)
    for row in read_tsv('week1_edges.tsv'):
        if len(row) >= 2 and row[0] in graph and row[1] in graph and row[0] != row[1]:
            graph.add_edge(row[0], row[1])
    pages = [dict(name=x['name'], url=x['url'], article=x['article']) for x in nodes]
    data = dict(pages=pages, q1=question_one(nodes, texts, graph), q2=question_two(nodes, texts, graph), q3=question_three(nodes, texts))
    (ROOT / 'data/week6_questions.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('Q1 buckets', data['q1']['buckets'])
    for p in data['q1']['pairs']:
        print(pages[p['a']]['name'], '|', pages[p['b']]['name'], p['cosine'], p['distance'], [t['term'] for t in p['terms']])
    print('Q2 communities', data['q2']['communities'])
    for k, p in data['q2']['pairs'].items():
        print(k, p['accuracy'], p['accuracyNoNames'], p['majority'])
    print('Q3 topics'); [print(i, t) for i, t in enumerate(data['q3']['topics'])]
    print('length corr', data['q3']['lengthCorrelation'])
    for p in sorted(data['q3']['pages'], key=lambda p: -p['entropy'])[:15]:
        print(p['name'], p['entropy'], p['tokens'], p['top'], p['halfTop'], p['halfEntropy'])


if __name__ == '__main__':
    main()
