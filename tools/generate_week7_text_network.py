"""Week 7 Question 5: build an entity co-occurrence network from page text and compare it with the hyperlinks."""

import json
import re
from collections import defaultdict
from itertools import combinations

import networkx as nx

from generate_week7_unlikely_neighbors import ROOT, load_corpus, load_network

OUTPUT = ROOT / "data" / "week7_text_network.json"
SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“'(])")
GENERIC = {"the", "of", "and", "box", "echo", "dust", "force", "doctor", "captain", "agent"}
MAX_EVIDENCE = 2
MAX_SENTENCE = 260


def aliases_for(page, bases=()):
    name = page["name"]
    base = re.sub(r"\s*\([^)]*\)", "", name).strip()
    found = {base}
    for inner in re.findall(r"\(([^)]*)\)", name):
        if inner in {"character", "comics", "Marvel Comics", "comic book"}:
            continue
        if re.fullmatch(r"[A-Z][\w.'-]+(?: [A-Z][\w.'-]+){1,2}", inner) and not re.search(r"Marvel|Ultimate|Mangaverse|Earth", inner):
            found.add(inner.strip())
        else:
            # "(Ultimate Marvel character)" and similar mark a variant, so the bare name is not unique to it.
            found.discard(base)
    # The lead sentence usually gives the full name: "Spider-Man (Peter Parker)".
    lead = re.match(r"^([^.]{0,200}?)\(([A-Z][^()]{3,60})\)", page["text"])
    variant = any(other != base and base.startswith(other) for other in bases)
    if lead and not variant and lead.group(1).strip().rstrip(",") == base:
        found.add(lead.group(2).split(";")[0].strip())
    return {a for a in found if len(a) >= 4 and a.lower() not in GENERIC}


def build_matchers(pages):
    owners = defaultdict(set)
    bases = {re.sub(r"\s*\([^)]*\)", "", p["name"]).strip() for p in pages}
    for page in pages:
        for alias in aliases_for(page, bases):
            owners[alias].add(page["id"])
    names = {page["id"]: page["name"] for page in pages}
    generic = re.compile(r"^[^(]*?(\s*\((?:character|comics|Marvel Comics|comic book)\))?$")

    def canonical(ids):
        plain = [i for i in ids if generic.match(names[i])]
        return plain[0] if len(plain) == 1 else None

    unique, ambiguous = {}, []
    for alias, ids in owners.items():
        winner = next(iter(ids)) if len(ids) == 1 else canonical(ids)
        if winner:
            unique[alias] = winner
        else:
            ambiguous.append(alias)
    ambiguous.sort()
    pattern = re.compile(r"(?<![\w-])(" + "|".join(re.escape(a) for a in sorted(unique, key=len, reverse=True)) + r")(?![\w-])")
    return pattern, unique, ambiguous


def trim(sentence):
    sentence = re.sub(r"\s+", " ", sentence).strip()
    return sentence if len(sentence) <= MAX_SENTENCE else sentence[:MAX_SENTENCE].rsplit(" ", 1)[0] + "…"


def main():
    pages, _ = load_corpus()
    _, undirected, network = load_network(pages)
    by_id = {p["id"]: p for p in pages}
    pattern, alias_map, ambiguous = build_matchers(pages)
    covered = {pid for pid in alias_map.values()}

    pair_weight = defaultdict(int)
    pair_evidence = defaultdict(list)
    mentions = defaultdict(set)  # (page, entity) mentioned anywhere on the page
    total_sentences = 0
    for page in pages:
        for sentence in SENTENCE.split(page["text"]):
            total_sentences += 1
            ents = {alias_map[m] for m in pattern.findall(sentence)}
            for e in ents:
                if e != page["id"]:
                    mentions[page["id"]].add(e)
            for a, b in combinations(sorted(ents), 2):
                pair_weight[(a, b)] += 1
                if len(pair_evidence[(a, b)]) < MAX_EVIDENCE:
                    pair_evidence[(a, b)].append({"page": page["id"], "text": trim(sentence)})

    link_edges = {tuple(sorted(e)) for e in undirected.edges}
    text_edges = set(pair_weight)
    # Fair comparison: only links between characters whose names we can detect at all.
    detectable = {e for e in link_edges if e[0] in covered and e[1] in covered}

    def category(e):
        in_text, in_link = e in text_edges, e in link_edges
        return "both" if in_text and in_link else "text" if in_text else "link"

    edges = []
    for e in sorted(text_edges | link_edges):
        a, b = e
        try:
            dist = nx.shortest_path_length(undirected, a, b)
        except nx.NetworkXNoPath:
            dist = None
        cat = category(e)
        row = {"a": a, "b": b, "cat": cat, "w": pair_weight.get(e, 0), "d": dist}
        if cat == "text":
            row["third"] = all(ev["page"] not in e for ev in pair_evidence[e])
        if cat == "link":
            # Does either page mention the other at all? (name variants, different sentence...)
            row["mention"] = (b in mentions[a]) or (a in mentions[b])
        if e in pair_evidence:
            row["ev"] = pair_evidence[e]
        edges.append(row)

    thresholds = []
    for t in (1, 2, 3, 5, 10):
        kept = {e for e in text_edges if pair_weight[e] >= t}
        both = kept & link_edges
        thresholds.append({
            "min": t, "text": len(kept), "both": len(both), "textOnly": len(kept - link_edges),
            "linkOnly": len(detectable - kept),
            "precision": len(both) / len(kept) if kept else 0,
            "recall": len(both & detectable) / len(detectable) if detectable else 0,
        })

    out = {
        "version": 1,
        "pages": [{"id": p["id"], "name": p["name"], "url": p["url"], "degree": undirected.degree(p["id"]),
                   "detectable": p["id"] in covered} for p in pages],
        "edges": edges,
        "thresholds": thresholds,
        "summary": {
            "pages": len(pages), "sentences": total_sentences,
            "aliases": len(alias_map), "ambiguousAliases": ambiguous,
            "pagesWithAlias": len(covered),
            "linkEdges": len(link_edges), "linkEdgesDetectable": len(detectable),
            "textEdges": len(text_edges),
        },
    }
    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(out["summary"] | {"thresholds": thresholds}, indent=1)[:2500])
    print(OUTPUT.stat().st_size)


if __name__ == "__main__":
    main()
