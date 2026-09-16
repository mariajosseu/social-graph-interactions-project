"""Freeze Wikipedia infobox team affiliations for network or largest-clique members."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


class Element:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def find(self, tag):
        return [child for child in self.children if isinstance(child, Element)
                for child in ([child] if child.tag == tag else []) + child.find(tag)]

    def text(self):
        if self.tag in {'style', 'script', 'sup'}:
            return ''
        if self.tag == 'br':
            return '\n'
        return ''.join(child.text() if isinstance(child, Element) else child for child in self.children)


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, value):
        self.stack[-1].children.append(value)


def clean(text):
    return re.sub(r'\s+', ' ', text).strip()


def extract_affiliations(html, source_url):
    parser = ArticleParser()
    parser.feed(html)
    titles = parser.root.find('title')
    article_title = clean(titles[0].text()).removesuffix(' - Wikipedia') if titles else None
    teams = {}
    raw_fields = []
    for table in parser.root.find('table'):
        if 'infobox' not in table.attrs.get('class', '').split():
            continue
        for row in table.find('tr'):
            headings = row.find('th')
            if not headings or clean(headings[0].text()).lower() != 'team affiliations':
                continue
            cells = row.find('td')
            if not cells:
                continue
            cell = cells[0]
            raw_fields.append(clean(cell.text()))
            entries = cell.find('li') or [cell]
            for entry in entries:
                anchors = entry.find('a')
                for label in re.split(r'\n|,(?![^()]*\))', entry.text()):
                    label = clean(label)
                    if not label or label.lower() in {'none', 'n/a', 'unknown', '—', '-'} or re.fullmatch(r'\([^)]*\):?', label):
                        continue
                    anchor = next((a for a in anchors if clean(a.text()) and clean(a.text()) in label
                                   and '/wiki/' in a.attrs.get('href', '')), None)
                    url = urljoin(source_url, anchor.attrs['href']) if anchor else None
                    key = unquote(urlparse(url).path).removeprefix('/wiki/').replace('_', ' ') if url else label
                    teams.setdefault(key, {'id': key, 'name': label, 'url': url})
    return {'articleTitle': article_title, 'status': 'known' if teams else 'unknown', 'affiliations': list(teams.values()),
            'rawFields': raw_fields, 'reason': None if teams else 'No usable Team affiliations infobox entries found.'}


def main():
    args_parser = argparse.ArgumentParser(description=__doc__)
    args_parser.add_argument('--cache-dir', type=Path, default=ROOT / 'data' / 'week3_team_articles')
    args_parser.add_argument('--all', action='store_true', help='Scrape all characters for network-wide homophily')
    args_parser.add_argument('--workers', type=int, default=1)
    args_parser.add_argument('--delay', type=float, default=1.0, help='Pause between downloads per worker')
    args_parser.add_argument('--refresh', action='store_true')
    args = args_parser.parse_args()
    story = json.loads((ROOT / 'data/week3_story.json').read_text())
    views = story.get('cliqueViews', {'undirected': story['cliques']})
    ids = sorted({node for view in views.values() for clique in view['largest'] for node in clique})
    with (ROOT / 'data/week1_nodes.tsv').open() as handle:
        nodes = {row['node_id']: row for row in csv.DictReader((line for line in handle if not line.startswith('#')), delimiter='\t')}
    if args.all:
        ids = sorted(nodes)
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    records = {}

    def scrape(node_id):
        node = nodes[node_id]
        cache = args.cache_dir / (node_id + '.html')
        record = {'name': node['name'], 'sourceUrl': node['url'], 'sourceField': 'Team affiliations'}
        try:
            if args.refresh or not cache.exists():
                request = Request(node['url'], headers={'User-Agent': 'MarvelCourseProject/1.0 (educational team affiliation snapshot)'})
                with urlopen(request, timeout=45) as response:
                    html = response.read().decode('utf-8')
                    record['resolvedUrl'] = response.url
                cache.write_text(html)
                time.sleep(args.delay)
            else:
                html = cache.read_text()
            record['retrievedAt'] = datetime.fromtimestamp(cache.stat().st_mtime, timezone.utc).isoformat()
            revision = re.search(r'"wgRevisionId"\s*:\s*(\d+)', html) or re.search(r'/revision/(\d+)', html)
            if revision:
                record['revisionId'] = int(revision.group(1))
                record['revisionUrl'] = 'https://en.wikipedia.org/w/index.php?oldid=' + revision.group(1)
            record.update(extract_affiliations(html, node['url']))
        except Exception as error:
            record.update(status='unknown', affiliations=[], rawFields=[], articleTitle=None, reason=f'Article fetch or parsing failed: {error}')
        return node_id, record
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for node_id, record in pool.map(scrape, ids):
            records[node_id] = record
            node = nodes[node_id]
            print(node['name'], record['status'], ' | '.join(team['name'] for team in record['affiliations']), flush=True)
    payload = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'scope': 'All network characters' if args.all else 'Members of the largest undirected and directed cliques only',
               'method': 'Wikipedia infobox Team affiliations; multiple memberships retained, linked article titles used as affiliation IDs. No inferred memberships.',
               'members': records}
    (ROOT / 'data/week3_teams.json').write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
