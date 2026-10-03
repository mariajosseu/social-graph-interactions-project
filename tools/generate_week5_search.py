"""Build raw-count Bag-of-Words vectors for the frozen Marvel articles."""
import csv
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]

def tokenize(text):
    return [word.lower().replace('’', "'") for word in re.findall(r"[a-zA-Z]+(?:['’][a-zA-Z]+)*|[0-9]+", text)]

def main():
    with (ROOT / 'data/week1_nodes.tsv').open() as handle:
        nodes = list(csv.DictReader((line for line in handle if not line.startswith('#')), delimiter='\t'))
    pages, index = [], defaultdict(list)
    for node in nodes:
        encoded = quote(node['node_id'], safe="~()*!.'-,")
        filename = ROOT / 'data/marvel_pages' / (encoded + '.txt')
        if not filename.exists():
            encoded = quote(encoded, safe="~()*!.'-,")
            filename = ROOT / 'data/marvel_pages' / (encoded + '.txt')
        text = filename.read_text()
        counts = Counter(tokenize(text))
        page_id = len(pages)
        pages.append(dict(name=node['name'], url=node['url'], article='data/marvel_pages/' + encoded + '.txt', norm=math.sqrt(sum(n*n for n in counts.values())), tokens=sum(counts.values())))
        for term, count in counts.items():
            index[term].append([page_id, count])
    data = dict(pages=pages, index=dict(index))
    (ROOT / 'data/week5_search.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    for query in ['Norse god of thunder', 'friendly neighborhood spider man', 'the hero', 'telepath', 'telepathy', 'green angry scientist', 'qzxvpl']:
        counts = Counter(tokenize(query)); norm = math.sqrt(sum(n*n for n in counts.values())); dots = defaultdict(int)
        for word, count in counts.items():
            for page, frequency in index.get(word, []): dots[page] += count*frequency
        ranked = sorted(((score / (norm*pages[page]['norm']), pages[page]['name']) for page, score in dots.items()), reverse=True)
        print(query, [(name, round(score,4)) for score, name in ranked[:5]])

if __name__ == '__main__':
    main()
