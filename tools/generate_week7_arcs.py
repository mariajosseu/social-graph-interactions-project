"""Score the acquired Marvel stories and freeze the Week 7 arc experiment.

See README for acquisition and isolated legacy-model dependencies. Full story
texts stay in the local cache. The site receives scores and three short excerpts
per story, with source links and content hashes.
"""
import argparse
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import sys

import numpy as np
from nltk.tokenize.punkt import PunktParameters, PunktSentenceTokenizer
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from week7_arc_math import cluster_arcs, correlation, resample, smooth, standardize

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/vendor'))
from torchmoji.model_def import torchmoji_emojis
from torchmoji.sentence_tokenizer import SentenceTokenizer

CACHE = Path('/private/tmp/week7-arcs')
ANGER = [32, 55]  # :rage: and :angry:, fixed before running the stories.
FRACTIONS = (.03, .05, .10)
CHECKS = [
    ('anger', 'I am furious with you. How dare you betray me!'),
    ('anger', 'Get out of my house! I never want to see you again.'),
    ('grief', 'I miss her every day. The house feels empty without her.'),
    ('grief', 'He sat beside the grave and cried quietly.'),
    ('relief', 'You are safe. I thought I had lost you.'),
    ('joy', 'We won! I am so happy to see everyone together again.'),
    ('neutral', 'The meeting starts at three in the afternoon.'),
    ('sarcasm', 'Great timing, Avengers. You arrived five hours after we needed you.'),
]


def sentence_splitter():
    params = PunktParameters()
    params.abbrev_types = {'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'etc', 'jr', 'sr'}
    return PunktSentenceTokenizer(params)


class Instruments:
    def __init__(self):
        torch.set_num_threads(2)
        self.tokenizer = AutoTokenizer.from_pretrained('/private/tmp/week7-model', local_files_only=True)
        self.classifier = AutoModelForSequenceClassification.from_pretrained('/private/tmp/week7-model', local_files_only=True).eval()
        self.moji = torchmoji_emojis(str(CACHE / 'torchmoji.bin')).eval()
        self.moji_tokenizer = SentenceTokenizer(json.loads((CACHE / 'vocabulary.json').read_text()), 80)
        self.memo_path = CACHE / 'sentence_scores_v1.json'
        self.memo = json.loads(self.memo_path.read_text()) if self.memo_path.exists() else {}

    def score(self, sentences):
        result = []
        truncated = dict(classifier=0, deepmoji=0)
        for start in range(0, len(sentences), 32):
            batch = sentences[start:start + 32]
            lengths = self.tokenizer(batch, truncation=False, return_length=True)['length']
            truncated['classifier'] += sum(length > 512 for length in lengths)
            truncated['deepmoji'] += sum(len(self.moji_tokenizer.wordgen.get_words(s)) > 80 for s in batch)
            keys = [hashlib.sha256(s.encode()).hexdigest() for s in batch]
            missing = [s for s, key in zip(batch, keys) if key not in self.memo]
            if missing:
                encoding = self.tokenizer(missing, return_tensors='pt', padding=True, truncation=True, max_length=512)
                tokenized, _, _ = self.moji_tokenizer.tokenize_sentences(missing)
                with torch.inference_mode():
                    negative = self.classifier(**encoding).logits.softmax(-1)[:, 0].tolist()
                    emojis = self.moji(torch.tensor(tokenized.tolist(), dtype=torch.long))
                    anger = emojis[:, ANGER].sum(-1).tolist()
                for sentence, a, b in zip(missing, negative, anger):
                    self.memo[hashlib.sha256(sentence.encode()).hexdigest()] = [round(a, 6), round(b, 6)]
            result.extend([self.memo[key] for key in keys])
        self.memo_path.write_text(json.dumps(self.memo))
        return result, truncated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--corpus', type=Path, default=CACHE / 'corpus.json')
    args = parser.parse_args()
    corpus = json.loads(args.corpus.read_text())
    instruments = Instruments()
    checks, _ = instruments.score([s for _, s in CHECKS])
    print('Instrument check:', checks, flush=True)
    split = sentence_splitter()
    stories = []
    negativity = []
    for entry in corpus['stories']:
        text = Path(entry['text_path']).read_text()
        digest = hashlib.sha256(text.encode()).hexdigest()
        sentences = [s.strip() for s in split.tokenize(text) if any(c.isalpha() for c in s)]
        score_path = CACHE / f'{entry["id"]}-{digest[:12]}-scores-v1.json'
        if score_path.exists():
            scored = json.loads(score_path.read_text())
        else:
            scores, truncation = instruments.score(sentences)
            scored = dict(scores=scores, truncation=truncation)
            score_path.write_text(json.dumps(scored))
        scores = np.asarray(scored['scores'])
        assert len(scores) == len(sentences) and len(scores) >= 50
        assert np.isfinite(scores).all() and np.min(scores) >= 0 and np.max(scores) <= 1
        arcs = {}
        for fraction in FRACTIONS:
            neg = resample(smooth(scores[:, 0], fraction))
            anger = resample(smooth(scores[:, 1], fraction))
            arcs[str(round(100 * fraction))] = dict(negative=neg.round(6).tolist(), anger=anger.round(6).tolist(),
                                                   r=correlation(neg, anger))
        neg5 = np.array(arcs['5']['negative'])
        anger5 = np.array(arcs['5']['anger'])
        points = [('Near negativity peak', int(np.argmax(neg5)), scores[:, 0]),
                  ('Near anger peak', int(np.argmax(anger5)), scores[:, 1]),
                  ('Largest relative mismatch', int(np.argmax(standardize(neg5) - standardize(anger5))),
                   standardize(scores[:, 0]) - standardize(scores[:, 1]))]
        excerpts = []
        for label, point, signal in points:
            center = round(point / 99 * (len(sentences) - 1))
            radius = max(1, int(round(len(sentences) * .05))) // 2
            left, right = max(0, center - radius), min(len(sentences), center + radius + 1)
            index = left + int(np.argmax(signal[left:right]))
            words = sentences[index].split()
            excerpts.append(dict(label=label, index=index, position=round(100 * index / (len(sentences) - 1), 2),
                                 text=' '.join(words[:24]) + (' …' if len(words) > 24 else ''),
                                 negative=float(scores[index, 0]), anger=float(scores[index, 1])))
        story = {k: v for k, v in entry.items() if k != 'text_path'}
        story.update(sentence_count=len(sentences), text_sha256=digest, arcs=arcs, excerpts=excerpts,
                     truncation=scored['truncation'], scores=scored['scores'])
        stories.append(story)
        negativity.append(scores[:, 0])
        print(f'{len(stories)}/{len(corpus["stories"])} {entry["title"]}: {len(sentences)} sentences', flush=True)
    clusters = cluster_arcs(negativity)
    snapshot = dict(stories=stories, clustering=clusters,
                    checks=[dict(expected=tag, text=text, negative=score[0], anger=score[1]) for (tag, text), score in zip(CHECKS, checks)],
                    metadata=dict(corpus=corpus['metadata'], anger_emoji_ids=ANGER, anger_emoji=['😡', '😠'],
                                  deepmoji_model='Uberduck/torchmoji', deepmoji_revision='ff04492fe67db898d9bcbd923ee1192646132286',
                                  deepmoji_code='huggingface/torchMoji@9dd01df645dd84b3645633f55067c0bbcac90011',
                                  classifier='distilbert/distilbert-base-uncased-finetuned-sst-2-english',
                                  classifier_revision='714eb0fa89d2f80546fda750413ed43d93601a13',
                                  smoothing='Centered odd-width moving average with shortened windows at edges; 3%, 5%, or 10% of sentences; linear interpolation to 100 positions.',
                                  clustering='KMeans on standardized (zero mean, unit standard deviation) valence arcs, where valence=1−2P(negative). k=2…8; n_init=20; random states 42,17,91. Seed stability is mean ARI vs seed 42; smoothing stability is ARI vs 5%.',
                                  sentence_split='NLTK PunktSentenceTokenizer with fixed abbreviation list; sentence order retained; each sentence weighted equally.',
                                  versions={name: version(name) for name in ['numpy', 'nltk', 'torch', 'transformers', 'scikit-learn', 'emoji']}))
    path = ROOT / 'data/week7_arcs.json'
    path.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    print('Wrote', path, flush=True)


if __name__ == '__main__':
    main()
