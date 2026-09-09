import json
import math
import random
import statistics
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "week2_story.json"
SEED = 2805


def read_tsv(path):
    rows = []
    for line in path.read_text().splitlines():
        if line and not line.startswith("#"):
            rows.append(line.split("\t"))
    return rows[1:]


def build_graph():
    node_rows = read_tsv(DATA / "week1_nodes.tsv")
    edge_rows = read_tsv(DATA / "week1_edges.tsv")
    nodes = [{"id": row[0], "name": row[1] or row[0].replace("_", " ")} for row in node_rows]
    ids = [node["id"] for node in nodes]
    edges = set()
    for source, target, *_ in edge_rows:
        if source != target and source in ids and target in ids:
            edges.add(tuple(sorted((source, target))))
    adjacency = {node_id: set() for node_id in ids}
    for source, target in edges:
        adjacency[source].add(target)
        adjacency[target].add(source)
    return nodes, sorted(edges), adjacency


def components(graph):
    seen = set()
    found = []
    for start in graph:
        if start in seen:
            continue
        queue = [start]
        seen.add(start)
        component = []
        while queue:
            current = queue.pop()
            component.append(current)
            for neighbor in graph[current]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    queue.append(neighbor)
        found.append(component)
    return sorted(found, key=len, reverse=True)


def graph_metrics(graph, edge_list):
    degrees = {node_id: len(neighbors) for node_id, neighbors in graph.items()}
    triangles = 0
    local = {}
    for node_id, neighbors in graph.items():
        ordered = list(neighbors)
        links = sum(1 for index, left in enumerate(ordered) for right in ordered[index + 1:] if right in graph[left])
        local[node_id] = links / (len(ordered) * (len(ordered) - 1)) if len(ordered) > 1 else 0
        triangles += links
    triangles //= 3
    component_list = components(graph)
    giant = set(component_list[0]) if component_list else set()
    distances = []
    diameter = 0
    for start in giant:
        distance = {start: 0}
        queue = deque([start])
        while queue:
            current = queue.popleft()
            for neighbor in graph[current]:
                if neighbor in giant and neighbor not in distance:
                    distance[neighbor] = distance[current] + 1
                    queue.append(neighbor)
        distances.extend(value for node_id, value in distance.items() if node_id != start)
        diameter = max(diameter, max(distance.values(), default=0))
    degree_pairs = [(degrees[source], degrees[target]) for source, target in edge_list]
    degree_mean = sum(degrees.values()) / len(degrees) if degrees else 0
    pair_mean = sum(left + right for left, right in degree_pairs) / (2 * len(degree_pairs)) if degree_pairs else 0
    numerator = sum(2 * (left - pair_mean) * (right - pair_mean) for left, right in degree_pairs)
    denominator = sum((left - pair_mean) ** 2 + (right - pair_mean) ** 2 for left, right in degree_pairs)
    assortativity = numerator / denominator if denominator else 0
    return {
        "n": len(graph),
        "m": len(edge_list),
        "meanDegree": degree_mean,
        "maxDegree": max(degrees.values(), default=0),
        "degreeVariance": sum((value - degree_mean) ** 2 for value in degrees.values()) / len(degrees) if degrees else 0,
        "triangles": triangles,
        "clustering": sum(local.values()) / len(local) if local else 0,
        "assortativity": assortativity,
        "meanPath": sum(distances) / len(distances) if distances else 0,
        "diameter": diameter,
        "components": len(component_list),
        "isolates": sum(1 for component in component_list if len(component) == 1),
        "degrees": degrees,
        "localClustering": local,
    }


def swap_graph(graph, edge_list, swaps, rng):
    edges = set(edge_list)
    for _ in range(swaps):
        for _attempt in range(100):
            first = rng.choice(tuple(edges))
            second = rng.choice(tuple(edges))
            if len(set(first + second)) < 4:
                continue
            a, b = first
            c, d = second
            if rng.random() < 0.5:
                a, c = c, a
            new_edges = {tuple(sorted((a, d))), tuple(sorted((c, b)))}
            if len(new_edges) != 2 or new_edges & edges:
                continue
            edges.remove(first)
            edges.remove(second)
            edges.update(new_edges)
            break
    result = {node_id: set() for node_id in graph}
    for source, target in edges:
        result[source].add(target)
        result[target].add(source)
    return result, sorted(edges)


def preferential_attachment(node_ids, m, rng):
    graph = {node_id: set() for node_id in node_ids[:m + 1]}
    growth = []
    seed_nodes = node_ids[:m + 1]
    for source, target in [(seed_nodes[1], seed_nodes[2]), (seed_nodes[3], seed_nodes[4]), (seed_nodes[3], seed_nodes[5]), (seed_nodes[4], seed_nodes[5])]:
        graph[source].add(target)
        graph[target].add(source)
    growth.append({"nodes": list(seed_nodes), "edges": [list(edge) for edge in sorted(tuple(sorted((a, b))) for a in graph for b in graph[a] if a < b)]})
    for node_id in node_ids[m + 1:]:
        graph[node_id] = set()
        pool = [existing for existing, neighbors in graph.items() if existing != node_id for _ in range(max(1, len(neighbors)))]
        targets = set()
        while len(targets) < m and pool:
            targets.add(rng.choice(pool))
        for target in targets:
            graph[node_id].add(target)
            graph[target].add(node_id)
        growth.append({"nodes": list(graph), "newNode": node_id, "newTargets": sorted(targets), "edges": [list(edge) for edge in sorted(tuple(sorted((a, b))) for a in graph for b in graph[a] if a < b)]})
    return graph, growth


def ccdf(graph, node_ids):
    degrees = sorted((len(graph[node_id]) for node_id in node_ids), reverse=True)
    total = len(degrees)
    return [{"degree": degree, "survival": sum(1 for value in degrees if value >= degree) / total} for degree in sorted(set(degrees)) if degree > 0]


def ccdf_fit(points):
    usable = [(math.log(point["degree"]), math.log(point["survival"])) for point in points if point["degree"] > 0 and point["survival"] > 0]
    if len(usable) < 2:
        return {"slope": 0, "intercept": 0, "r2": 0, "points": len(usable)}
    mean_x = sum(point[0] for point in usable) / len(usable)
    mean_y = sum(point[1] for point in usable) / len(usable)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in usable)
    denominator = sum((x - mean_x) ** 2 for x, _ in usable)
    slope = numerator / denominator if denominator else 0
    intercept = mean_y - slope * mean_x
    total = sum((y - mean_y) ** 2 for _, y in usable)
    residual = sum((y - (intercept + slope * x)) ** 2 for x, y in usable)
    return {"slope": slope, "intercept": intercept, "r2": 1 - residual / total if total else 0, "points": len(usable)}


def round_values(value):
    if isinstance(value, float):
        return round(value, 6)
    return value


def main():
    nodes, edges, graph = build_graph()
    node_ids = [node["id"] for node in nodes]
    names = {node["id"]: node["name"] for node in nodes}
    real_metrics = graph_metrics(graph, edges)
    real_edges = [list(edge) for edge in edges]
    rng = random.Random(SEED)
    swap_stages = []
    for index, multiplier in enumerate([0, 0.5, 1, 2, 5, 10]):
        shuffled, shuffled_edges = swap_graph(graph, edges, int(len(edges) * multiplier), random.Random(SEED + index))
        swap_stages.append({"label": ["REAL MARVEL", "FIRST REWIRE", "REWIRED", "DEEP SCRAMBLE", "VERY SCRAMBLED", "SCRAMBLED MARVEL"][index], "multiplier": multiplier, "edges": [list(edge) for edge in shuffled_edges], "metrics": graph_metrics(shuffled, shuffled_edges)})
    null_metrics = []
    for index in range(60):
        shuffled, shuffled_edges = swap_graph(graph, edges, len(edges) * 10, random.Random(SEED + 100 + index))
        metrics = graph_metrics(shuffled, shuffled_edges)
        null_metrics.append({key: metrics[key] for key in ["clustering", "triangles", "assortativity", "meanPath", "diameter"]})
    null_summary = {}
    for key in ["clustering", "triangles", "assortativity", "meanPath", "diameter"]:
        values = [item[key] for item in null_metrics]
        real_value = real_metrics[key]
        null_summary[key] = {"mean": statistics.mean(values), "sd": statistics.pstdev(values), "min": min(values), "max": max(values), "realPercentile": sum(value <= real_value for value in values) / len(values)}
    ba_m = max(1, round(real_metrics["meanDegree"] / 2))
    ba_graph, growth = preferential_attachment(node_ids, ba_m, random.Random(SEED + 500))
    ba_edges = sorted(tuple(sorted((source, target))) for source in ba_graph for target in ba_graph[source] if source < target)
    ba_metrics = graph_metrics(ba_graph, ba_edges)
    er_rng = random.Random(SEED + 900)
    er_graph = {node_id: set() for node_id in node_ids}
    possible = [(node_ids[i], node_ids[j]) for i in range(len(node_ids)) for j in range(i + 1, len(node_ids))]
    for source, target in er_rng.sample(possible, len(edges)):
        er_graph[source].add(target)
        er_graph[target].add(source)
    game_nodes = []
    popular_friends = {node_id: 0 for node_id in node_ids}
    unbeatable = []
    for node_id in node_ids:
        neighbors = sorted(graph[node_id])
        if not neighbors:
            continue
        neighbor_average = sum(real_metrics["degrees"][neighbor] for neighbor in neighbors) / len(neighbors)
        game_nodes.append({"id": node_id, "name": names[node_id], "degree": real_metrics["degrees"][node_id], "neighborAverage": neighbor_average, "neighbors": neighbors})
        for neighbor in neighbors:
            popular_friends[neighbor] += 1
        if all(real_metrics["degrees"][node_id] >= real_metrics["degrees"][neighbor] for neighbor in neighbors):
            unbeatable.append(node_id)
    real_metrics["topDegree"] = sorted(([node_id, names[node_id], degree] for node_id, degree in real_metrics["degrees"].items()), key=lambda row: row[2], reverse=True)[:12]
    real_metrics["degreePreserved"] = all(stage["metrics"]["degrees"] == real_metrics["degrees"] for stage in swap_stages)
    real_metrics["popularFriends"] = sorted(([node_id, names[node_id], count, real_metrics["degrees"][node_id]] for node_id, count in popular_friends.items()), key=lambda row: row[2], reverse=True)[:12]
    real_metrics["unbeatable"] = [[node_id, names[node_id], real_metrics["degrees"][node_id]] for node_id in unbeatable]
    real_metrics["friendshipFraction"] = sum(item["neighborAverage"] > item["degree"] for item in game_nodes) / len(game_nodes) if game_nodes else 0
    real_metrics["neighborAverage"] = sum(item["neighborAverage"] for item in game_nodes) / len(game_nodes) if game_nodes else 0
    payload = {
        "nodes": nodes,
        "real": {"edges": real_edges, "metrics": real_metrics},
        "shuffleStages": swap_stages,
        "nullMetrics": null_metrics,
        "nullSummary": null_summary,
        "ba": {"m": ba_m, "growth": growth, "edges": [list(edge) for edge in ba_edges], "metrics": ba_metrics},
        "er": {"edges": [list(edge) for edge in sorted(tuple(sorted((a, b))) for a in er_graph for b in er_graph[a] if a < b)], "metrics": graph_metrics(er_graph, sorted(tuple(sorted((a, b))) for a in er_graph for b in er_graph[a] if a < b))},
        "ccdf": {"real": ccdf(graph, node_ids), "ba": ccdf(ba_graph, node_ids), "er": ccdf(er_graph, node_ids)},
        "game": {"nodes": game_nodes, "unbeatable": real_metrics["unbeatable"]},
        "generatedFrom": "data/week1_nodes.tsv + data/week1_edges.tsv",
    }
    payload["ccdfFit"] = {key: ccdf_fit(payload["ccdf"][key]) for key in ["real", "ba", "er"]}
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"Wrote {OUT} from {len(nodes)} nodes and {len(edges)} undirected edges")
    print(json.dumps({"real": {key: real_metrics[key] for key in ["n", "m", "meanDegree", "maxDegree", "clustering", "triangles", "assortativity", "meanPath", "components"]}, "ba": {key: ba_metrics[key] for key in ["meanDegree", "maxDegree", "clustering", "triangles"]}, "friendshipFraction": real_metrics["friendshipFraction"]}, indent=2))


if __name__ == "__main__":
    main()
