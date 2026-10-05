"""Build an exact shared-passage network from the local Marvel snapshot."""
import csv
import json
import re
from collections import defaultdict
from itertools import combinations
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]

def shared_edges(documents, minimum=16):
    index = defaultdict(lambda: defaultdict(list))
    for doc, words in enumerate(documents):
        for start in range(len(words) - minimum + 1):
            index[tuple(words[start:start + minimum])][doc].append(start)
    candidates = defaultdict(list)
    for occurrences in index.values():
        for a, b in combinations(sorted(occurrences), 2):
            candidates[a, b].append((occurrences[a], occurrences[b]))
    edges = []
    for (a, b), seeds in sorted(candidates.items()):
        best = (0, 0, 0)
        for starts_a, starts_b in seeds:
            for i in starts_a:
                for j in starts_b:
                    # Only extend the first window of a shared run.
                    if i and j and documents[a][i - 1] == documents[b][j - 1]:
                        continue
                    length = minimum
                    while i + length < len(documents[a]) and j + length < len(documents[b]) and documents[a][i + length] == documents[b][j + length]:
                        length += 1
                    if length > best[0]:
                        best = (length, i, j)
        length, i, j = best
        if length:
            edges.append(dict(source=a, target=b, length=length, startSource=i, startTarget=j, sharedWindows=len(seeds)))
    return edges

def main():
    with (ROOT / 'data/week1_nodes.tsv').open() as handle:
        nodes = list(csv.DictReader((line for line in handle if not line.startswith('#')), delimiter='\t'))
    documents, spans, texts, output_nodes = [], [], [], []
    for node in nodes:
        filename = ROOT / 'data/marvel_pages' / (quote(node['node_id'], safe="~()*!.'-,") + '.txt')
        if not filename.exists():
            filename = ROOT / 'data/marvel_pages' / (quote(quote(node['node_id'], safe="~()*!.'-,"), safe="~()*!.'-,") + '.txt')
        if not filename.exists():
            raise FileNotFoundError(node['node_id'])
        text = filename.read_text()
        matches = list(re.finditer(r"[a-zA-Z]+(?:['’][a-zA-Z]+)*|[0-9]+", text))
        documents.append([m.group().lower().replace('’', "'") for m in matches])
        spans.append([(m.start(), m.end()) for m in matches])
        texts.append(text)
        output_nodes.append(dict(id=node['node_id'], name=node['name'], url=node['wikipedia_url'] if 'wikipedia_url' in node else 'https://en.wikipedia.org/wiki/' + quote(node['node_id']), tokens=len(matches)))
    edges = shared_edges(documents)
    for edge in edges:
        for key, doc_key, start_key in [('sourceExcerpt', 'source', 'startSource'), ('targetExcerpt', 'target', 'startTarget')]:
            doc, start = edge[doc_key], edge[start_key]
            end = start + edge['length'] - 1
            edge[key] = texts[doc][spans[doc][start][0]:spans[doc][end][1]]
        for key in ['startSource', 'startTarget']:
            del edge[key]
    excerpts = []
    excerpt_ids = {}
    for edge in edges:
        for key in ['sourceExcerpt', 'targetExcerpt']:
            passage = edge[key]
            if passage not in excerpt_ids:
                excerpt_ids[passage] = len(excerpts)
                excerpts.append(passage)
            edge[key] = excerpt_ids[passage]
    result = dict(minimum=16, nodes=output_nodes, edges=edges, excerpts=excerpts)
    (ROOT / 'data/week5_copying.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(nodes)} pages; {len(edges)} pairs share at least 16 tokens')
    for edge in sorted(edges, key=lambda e: -e['length'])[:8]:
        print(output_nodes[edge['source']]['name'], '/', output_nodes[edge['target']]['name'], edge['length'], excerpts[edge['sourceExcerpt']][:350])

if __name__ == '__main__':
    main()
