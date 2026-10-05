"""Louvain communities of the Marvel network plus one trigram model per community."""
import csv
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import quote

import networkx as nx

ROOT = Path(__file__).resolve().parents[1]
FOOTER = r'^\s*(?:References|Notes|Footnotes|External links|Further reading|Bibliography)\s*$'


def norm(token):
    return re.sub(r"[^a-z0-9']", '', token.lower())


def load_text(node_id):
    encoded = quote(node_id, safe="~()*!.'-,")
    path = ROOT / 'data/marvel_pages' / (encoded + '.txt')
    if not path.exists():
        path = ROOT / 'data/marvel_pages' / (quote(encoded, safe="~()*!.'-,") + '.txt')
    return re.split(FOOTER, path.read_text(), maxsplit=1, flags=re.M)[0]


def main():
    with (ROOT / 'data/week1_nodes.tsv').open() as handle:
        nodes = list(csv.DictReader((l for l in handle if not l.startswith('#')), delimiter='\t'))
    with (ROOT / 'data/week1_edges.tsv').open() as handle:
        edges = list(csv.reader((l for l in handle if not l.startswith('#')), delimiter='\t'))[1:]
    names = {n['node_id']: n['name'] for n in nodes}
    graph = nx.Graph()
    graph.add_nodes_from(names)
    graph.add_edges_from((a, b) for a, b, *_ in edges if a in names and b in names and a != b)
    indegree = Counter(b for a, b, *_ in edges if a != b)
    communities = nx.community.louvain_communities(graph, seed=42)
    communities = [c for c in sorted(communities, key=len, reverse=True)]
    big = [c for c in communities if len(c) >= 10]
    small = set().union(*[c for c in communities if len(c) < 10]) if len(big) < len(communities) else set()
    print('communities', [len(c) for c in communities], 'modularity',
          round(nx.community.modularity(graph, communities), 3))

    out, unigrams = [], []
    for k, members in enumerate(big):
        tri = defaultdict(Counter)
        uni = Counter()
        starts = Counter()
        for node_id in members:
            for paragraph in re.split(r'\n\s*\n', load_text(node_id)):
                words = paragraph.split()
                if len(words) < 3:
                    continue
                starts[(words[0], words[1])] += 1
                for w in words:
                    if norm(w):
                        uni[norm(w)] += 1
                padded = words + ['<END>']
                for a, b, c in zip(padded, padded[1:], padded[2:]):
                    tri[a, b][c] += 1
        unigrams.append(uni)
        top = sorted(members, key=lambda n: -indegree[n])[:4]
        out.append(dict(id=k, size=len(members), tokens=sum(uni.values()),
                        leaders=[names[n] for n in top], members=sorted(names[n] for n in members),
                        starts=[[a, b, c] for (a, b), c in starts.most_common(300)], tri=tri))

    total = sum(unigrams, Counter())
    for k, entry in enumerate(out):
        uni = unigrams[k]
        n_k, n_all = sum(uni.values()), sum(total.values())
        scored = sorted(((uni[w] / n_k) * math.log((uni[w] / n_k) / ((total[w] - uni[w] + 1) / (n_all - n_k))), w)
                        for w in uni if uni[w] >= 5)
        entry['signature'] = [w for _, w in scored[-12:][::-1]]
        entry['uni'] = {w: c for w, c in uni.items() if c >= 2}
        # Keep only repeated contexts so sampling copies less and the file stays small.
        entry['tri'] = {f'{a}\t{b}': [[c, n] for c, n in nxt.most_common(12)]
                        for (a, b), nxt in entry['tri'].items() if sum(nxt.values()) >= 2}
    (ROOT / 'data/week5_autocomplete.json').write_text(
        json.dumps(dict(communities=out, ignored=len(small)), ensure_ascii=False, separators=(',', ':')) + '\n')
    for e in out:
        print(e['id'], e['size'], e['leaders'], e['signature'][:6], len(e['tri']))


if __name__ == '__main__':
    main()
