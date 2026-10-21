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


def question_five(nodes, texts, graph):
    """Build an interpretable vocabulary axis and compare it with visibility."""
    mutant_terms = {'mutant', 'mutants', 'xmen', 'telepathic', 'psychic', 'gene', 'genes', 'school', 'xavier', 'cyclops', 'wolverine', 'storm'}
    symbiote_terms = {'symbiote', 'symbiotes', 'venom', 'spider', 'parker', 'web', 'carnage', 'eddie', 'brock', 'goblin'}
    token_re = re.compile(TOKEN)
    caps = capitalised(texts)
    raw = []
    degrees = np.array([graph.degree(node['node_id']) for node in nodes], dtype=float)
    lengths = np.array([len(token_re.findall(text)) for text in texts], dtype=float)
    name_density = np.array([sum(token.lower() in caps for token in token_re.findall(text)) / max(1, lengths[i]) for i, text in enumerate(texts)])
    for text in texts:
        tokens = token_re.findall(text.lower())
        total = max(1, len(tokens))
        mutant = sum(token in mutant_terms for token in tokens) / total * 1000
        symbiote = sum(token in symbiote_terms for token in tokens) / total * 1000
        raw.append(mutant - symbiote)

    def percentile(values):
        order = np.argsort(np.argsort(values))
        return order / max(1, len(values) - 1)

    semantic = np.array(raw)
    semantic_rank = percentile(semantic)
    visibility_rank = percentile(degrees)
    length_rank = percentile(lengths)
    clustering = np.array([nx.clustering(graph, node['node_id']) for node in nodes])
    clustering_rank = percentile(clustering)
    diversity = np.array([len(set(token_re.findall(text.lower()))) / max(1, lengths[i]) for i, text in enumerate(texts)])
    diversity_rank = percentile(diversity)
    points = [
        dict(name=node['name'], url=node['url'], article=node['article'],
             semantic=round(float(semantic_rank[i]), 3), rawSemantic=round(float(semantic[i]), 3),
             visibility=round(float(visibility_rank[i]), 3), degree=int(degrees[i]), tokens=int(lengths[i]),
             length=round(float(length_rank[i]), 3), nameDensity=round(float(name_density[i]), 3),
             clustering=round(float(clustering_rank[i]), 3), diversity=round(float(diversity_rank[i]), 3))
        for i, node in enumerate(nodes)
    ]
    endpoint = lambda key, reverse=False: sorted(range(len(points)), key=lambda i: points[i][key], reverse=reverse)[:5]
    return dict(
        axisLeft='symbiote / Spider-Man vocabulary',
        axisRight='mutant / X-Men vocabulary',
        networkAxes=dict(x='visibility', y='clustering', xLabel='network visibility', yLabel='local clustering'),
        meaningAxes=dict(x='semantic', y='diversity', xLabel='mutant ↔ symbiote vocabulary', yLabel='lexical diversity'),
        points=points,
        endpoints=dict(semanticLow=endpoint('semantic'), semanticHigh=endpoint('semantic', True),
                       visibilityLow=endpoint('visibility'), visibilityHigh=endpoint('visibility', True)),
        terms=dict(left=sorted(symbiote_terms), right=sorted(mutant_terms)),
        nameDensityCorrelation=round(float(np.corrcoef(name_density, degrees)[0, 1]), 3),
        semanticVisibilityCorrelation=round(float(np.corrcoef(semantic, degrees)[0, 1]), 3))


def question_four(nodes, texts):
    """Compare full-text similarity with similarity after likely names are masked."""
    caps = capitalised(texts)
    full_vec = TfidfVectorizer(sublinear_tf=True, stop_words=STOP, token_pattern=TOKEN, min_df=2)
    masked_texts = [re.sub(r'(?u)\b[a-zA-Z][a-zA-Z]{2,}\b', lambda m: ' ' if m.group().lower() in caps else m.group(), text) for text in texts]
    masked_vec = TfidfVectorizer(sublinear_tf=True, stop_words=STOP, token_pattern=TOKEN, min_df=2)
    full_matrix = full_vec.fit_transform(texts)
    masked_matrix = masked_vec.fit_transform(masked_texts)
    full_terms = np.array(full_vec.get_feature_names_out())
    masked_terms = np.array(masked_vec.get_feature_names_out())
    full_similarity = (full_matrix @ full_matrix.T).toarray()
    masked_similarity = (masked_matrix @ masked_matrix.T).toarray()

    pairs = []
    for i, j in combinations(range(len(nodes)), 2):
        full = float(full_similarity[i, j])
        masked = float(masked_similarity[i, j])
        pairs.append((full, masked, i, j))

    drops = np.array([full - masked for full, masked, _, _ in pairs])
    full_values = np.array([full for full, _, _, _ in pairs])
    masked_values = np.array([masked for _, masked, _, _ in pairs])
    high = [pair for pair in pairs if pair[0] >= .12]
    high.sort(key=lambda pair: pair[0] - pair[1], reverse=True)
    meaning = sorted((pair for pair in pairs if pair[0] >= .12), key=lambda pair: pair[1], reverse=True)

    def record(pair):
        full, masked, i, j = pair
        contribution = full_matrix[i].multiply(full_matrix[j]).toarray()[0]
        top = np.argsort(-contribution)[:5]
        masked_contribution = masked_matrix[i].multiply(masked_matrix[j]).toarray()[0]
        masked_top = np.argsort(-masked_contribution)[:5]
        return dict(
            a=i, b=j, full=round(full, 4), masked=round(masked, 4),
            drop=round(full - masked, 4),
            names=[full_terms[t] for t in top if contribution[t] > 0][:4],
            meaning=[masked_terms[t] for t in masked_top if masked_contribution[t] > 0][:4])

    bins = []
    for lower in np.arange(0, 1, .05):
        upper = lower + .05
        values = [masked for full, masked, _, _ in pairs if lower <= full < upper]
        if values:
            bins.append(dict(full=round(float(lower + .025), 3), pairs=len(values), mean=round(float(np.mean(values)), 4)))
    bins.append(dict(full=1, pairs=sum(1 for full, _, _, _ in pairs if full >= 1), mean=0))
    return dict(
        nameCount=len(caps), pairCount=len(pairs), bins=bins,
        medianFull=round(float(np.median(full_values)), 4),
        medianMasked=round(float(np.median(masked_values)), 4),
        medianDrop=round(float(np.median(drops)), 4),
        highCount=len(high),
        highNameDriven=sum(1 for full, masked, _, _ in high if full - masked >= .08),
        highMeaningDriven=sum(1 for full, masked, _, _ in high if masked >= .12),
        nameDriven=[record(pair) for pair in high[:18]],
        meaningDriven=[record(pair) for pair in meaning[:18]])


def main():
    nodes, texts = load()
    ids = [x['node_id'] for x in nodes]
    graph = nx.Graph()
    graph.add_nodes_from(ids)
    for row in read_tsv('week1_edges.tsv'):
        if len(row) >= 2 and row[0] in graph and row[1] in graph and row[0] != row[1]:
            graph.add_edge(row[0], row[1])
    pages = [dict(name=x['name'], url=x['url'], article=x['article']) for x in nodes]
    data = dict(pages=pages, q1=question_one(nodes, texts, graph), q2=question_two(nodes, texts, graph), q3=question_three(nodes, texts), q5=question_five(nodes, texts, graph), q4=question_four(nodes, texts))
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
    print('Q4 names', data['q4']['nameCount'], 'median drop', data['q4']['medianDrop'])
    print('Q5 correlations', data['q5']['semanticVisibilityCorrelation'], data['q5']['nameDensityCorrelation'])


if __name__ == '__main__':
    main()
