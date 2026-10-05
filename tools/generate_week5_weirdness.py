"""Rank lexical outliers using Week 5 bag-of-words and cosine similarity."""
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from generate_week5_search import tokenize

ROOT = Path(__file__).resolve().parents[1]


def rank(pages, texts, clean=False):
    counts = []
    for text in texts:
        if clean:
            text = re.split(r'^\s*(?:References|Notes|Footnotes|External links|Further reading|Bibliography)\s*$', text, maxsplit=1, flags=re.M)[0]
        counts.append(Counter(t for t in tokenize(text) if not clean or not t.isdigit()))
    vectors = []
    centroid = defaultdict(float)
    for count in counts:
        norm = math.sqrt(sum(n * n for n in count.values()))
        vector = {t: n / norm for t, n in count.items()} if norm else {}
        vectors.append(vector)
        for term, value in vector.items():
            centroid[term] += value / len(pages)
    norm = math.sqrt(sum(v * v for v in centroid.values()))
    result = []
    for i, vector in enumerate(vectors):
        similarity = sum(value * centroid[t] for t, value in vector.items()) / norm if vector else 0
        terms = sorted(counts[i], key=lambda t: (-vector[t], t))[:10]
        result.append(dict(page=i, score=1-similarity, tokens=sum(counts[i].values()), terms=[dict(term=t, count=counts[i][t]) for t in terms]))
    result.sort(key=lambda row: (-row['score'], pages[row['page']]['name']))
    for position, row in enumerate(result, 1):
        row['rank'] = position
    return result


def main():
    pages = json.loads((ROOT / 'data/week5_search.json').read_text())['pages']
    texts = [(ROOT / p['article']).read_text() for p in pages]
    data = dict(pages=[{k: p[k] for k in ('name', 'url', 'article')} for p in pages], raw=rank(pages, texts), cleaned=rank(pages, texts, True))
    (ROOT / 'data/week5_weirdness.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    for mode in ('raw', 'cleaned'):
        print(mode, [(pages[r['page']]['name'], round(r['score'], 3), r['tokens'], [t['term'] for t in r['terms'][:5]]) for r in data[mode][:5]])


if __name__ == '__main__':
    main()
