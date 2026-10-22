"""Reproducible smoothing and shape comparisons for Week 7 story arcs."""
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score

SHAPES = [
    ('Rise', [0, 1]), ('Fall', [1, 0]), ('Fall–rise', [1, 0, 1]),
    ('Rise–fall', [0, 1, 0]), ('Rise–fall–rise', [0, 1, 0, 1]),
    ('Fall–rise–fall', [1, 0, 1, 0]),
]


def smooth(values, fraction):
    """Centered odd-width mean, with shorter windows at story boundaries."""
    values = np.asarray(values, dtype=float)
    width = max(1, int(round(len(values) * fraction)))
    if width % 2 == 0:
        width += 1
    radius = width // 2
    cumulative = np.r_[0, np.cumsum(values)]
    left = np.maximum(0, np.arange(len(values)) - radius)
    right = np.minimum(len(values), np.arange(len(values)) + radius + 1)
    return (cumulative[right] - cumulative[left]) / (right - left)


def resample(values, points=100):
    return np.interp(np.linspace(0, 1, points), np.linspace(0, 1, len(values)), values)


def standardize(values):
    values = np.asarray(values)
    return (values - values.mean()) / max(float(values.std()), 1e-8)


def correlation(a, b):
    if np.std(a) < 1e-8 or np.std(b) < 1e-8:
        return None
    return float(np.corrcoef(a, b)[0, 1])


def cluster_arcs(negativity, fractions=(.03, .05, .10), ks=range(2, 9)):
    templates = [standardize(resample(nodes)) for _, nodes in SHAPES]
    result = {}
    for fraction in fractions:
        # Positive-up valence is easier to compare with the published six shapes.
        matrix = np.array([standardize(resample(smooth(1 - 2 * np.asarray(v), fraction))) for v in negativity])
        runs = {}
        for k in ks:
            fits = [KMeans(n_clusters=k, random_state=seed, n_init=20).fit(matrix) for seed in (42, 17, 91)]
            main = fits[0]
            stability = [adjusted_rand_score(main.labels_, fit.labels_) for fit in fits[1:]]
            clusters = []
            for group, center in enumerate(main.cluster_centers_):
                similarities = [correlation(center, t) for t in templates]
                best = int(np.argmax(similarities))
                clusters.append(dict(id=group, members=np.flatnonzero(main.labels_ == group).tolist(),
                                     center=center.round(6).tolist(), resemblance=SHAPES[best][0],
                                     template_r=round(similarities[best], 4)))
            runs[str(k)] = dict(labels=main.labels_.tolist(), clusters=clusters,
                               silhouette=round(float(silhouette_score(matrix, main.labels_)), 4),
                               seed_stability=round(float(np.mean(stability)), 4))
        result[str(round(100 * fraction))] = dict(curves=matrix.round(6).tolist(), runs=runs)
    # Compare like-for-like cluster counts across smoothing widths.
    for pct, entry in result.items():
        for k, run in entry['runs'].items():
            run['smoothing_stability'] = round(float(adjusted_rand_score(result['5']['runs'][k]['labels'], run['labels'])), 4)
    return result
