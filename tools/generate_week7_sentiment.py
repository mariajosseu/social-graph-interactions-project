"""Freeze real outputs for the Week 7 controlled sentiment experiment.

Requires numpy, scikit-learn, nltk, torch and transformers. Downloads the
SST-2 model to /private/tmp/week7-model on first run; no server-side inference.
"""
import hashlib
from importlib.metadata import version
import json
import re
import urllib.request
from pathlib import Path

import nltk
import numpy as np
from nltk.corpus import movie_reviews
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch

ROOT = Path(__file__).resolve().parents[1]
MODEL = 'distilbert/distilbert-base-uncased-finetuned-sst-2-english'
REVISION = '714eb0fa89d2f80546fda750413ed43d93601a13'
# Deliberately small, fixed lookup instrument. No negation or word-order rules.
LEXICON = dict.fromkeys(['wonderful', 'great', 'enjoyed', 'loved', 'love', 'saved', 'excellent'], 1)
LEXICON.update(dict.fromkeys(['terrible', 'hated', 'hate', 'crushed', 'awful', 'doom', 'sinister', 'carnage'], -1))


def pairs():
    out = []
    def add(category, title, a, b, expected, note):
        out.append(dict(id=f'{category}-{sum(p["category"] == category for p in out)+1}',
                        category=category, title=title, sentences=[a, b], expected=expected, note=note))
    for name, action in [('Doctor Doom', 'gave a wonderful speech'), ('Mister Sinister', 'organized a great party'), ('Carnage', 'gave an excellent performance')]:
        add('names', name, f'{name} {action}.', f'Alex {action}.', ['positive', 'positive'],
            'Only the name changes. The explicit positive evaluation stays the same. A flip demonstrates sensitivity to the name, not knowledge of the character’s motives.')
    for target in ['the Avengers’ plan', 'Spider-Man’s performance', 'the Hulk’s entrance']:
        add('negation', target, f'I love {target}.', f'I do not love {target}.', ['positive', 'negative'],
            'Adding “do not” reverses the speaker’s evaluation; the character and the evaluated event stay fixed.')
    for a, b in [('rescue', 'ending'), ('acting', 'dialogue'), ('hero', 'villain')]:
        add('mixed', f'{a} / {b}', f'I loved the {a}, but hated the {b}.', f'I hated the {a}, but loved the {b}.', ['mixed', 'mixed'],
            'The same words express praise and criticism about different targets. Both readings are mixed. A single binary label cannot preserve those targets.')
    add('sarcasm', 'Rescue priorities',
        'Wonderful, Spider-Man carried me out of the burning building.',
        'Wonderful, Spider-Man carried my coffee out of the burning building.',
        ['positive', 'negative'],
        'Only the rescued object changes: “me” becomes “my coffee”. The sarcastic reading assumes the speaker still needs rescuing. “Wonderful” stays positive in the lexicon; the implied misplaced priority carries the criticism. Without that assumption, the second sentence is ambiguous.')
    add('sarcasm', 'Late arrival',
        'Great timing, Avengers. You arrived five minutes before we needed you.',
        'Great timing, Avengers. You arrived five hours after we needed you.',
        ['positive', 'negative'],
        'The arrival changes from early to late while “Great timing” stays fixed. The intended sarcastic reading comes from the mismatch between the praise and the delay, not a sinister character name.')
    add('sarcasm', 'Collateral damage',
        'Excellent work, Hulk. You opened the door without touching my car.',
        'Excellent work, Hulk. You opened the door by throwing my car through it.',
        ['positive', 'negative'],
        'The door opens in both versions; only the method changes. “Excellent work” becomes ironic when the solution involves throwing the speaker’s car. This tests an implied costly consequence rather than an explicit word such as “terrible”.')
    return out


def main():
    dataset = pairs()  # Authored expectations fixed before inference, not independent human annotations.
    ids = sorted(movie_reviews.fileids())
    texts = [movie_reviews.raw(i) for i in ids]
    labels = [int(movie_reviews.categories(i)[0] == 'pos') for i in ids]
    train, test = train_test_split(np.arange(len(ids)), test_size=.2, stratify=labels, random_state=42)
    vectorizer = TfidfVectorizer(lowercase=True, ngram_range=(1, 1), max_features=20000, min_df=2)
    x = vectorizer.fit_transform([texts[i] for i in train])
    clf = LogisticRegression(C=1, max_iter=1000, random_state=42).fit(x, np.array(labels)[train])
    accuracy = accuracy_score(np.array(labels)[test], clf.predict(vectorizer.transform([texts[i] for i in test])))
    cache = Path('/private/tmp/week7-model')
    cache.mkdir(exist_ok=True)
    for filename in ['config.json', 'tokenizer_config.json', 'vocab.txt', 'model.safetensors']:
        path = cache / filename
        if not path.exists():
            print(f'Downloading {filename}', flush=True)
            urllib.request.urlretrieve(f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{filename}', path.with_suffix(path.suffix + '.part'))
            path.with_suffix(path.suffix + '.part').rename(path)
    tokenizer = AutoTokenizer.from_pretrained(cache, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(cache, local_files_only=True).eval()
    torch.set_num_threads(2)
    for pair in dataset:
        pair['outputs'] = []
        for sentence in pair['sentences']:
            matches = [dict(word=w, score=LEXICON[w]) for w in re.findall(r'[a-z]+', sentence.lower()) if w in LEXICON]
            score = sum(m['score'] for m in matches)
            lexical = dict(label='positive' if score > 0 else 'negative' if score < 0 else 'neutral', score=score, matches=matches)
            p = float(clf.predict_proba(vectorizer.transform([sentence]))[0, 1])
            linear = dict(label='positive' if p >= .5 else 'negative', score=p)
            with torch.inference_mode():
                probs = model(**tokenizer(sentence, return_tensors='pt', truncation=True, max_length=512)).logits.softmax(-1)[0]
            contextual = dict(label='positive' if probs[1] >= probs[0] else 'negative', score=float(probs[1]))
            pair['outputs'].append(dict(lexicon=lexical, linear=linear, contextual=contextual))
    snapshot = dict(pairs=dataset, metadata=dict(
        model=MODEL, revision=REVISION, lexicon=LEXICON,
        dataset='NLTK movie_reviews: 2,000 English movie reviews (1,000 per class)',
        split='Stratified 80/20 split, random_state=42; vocabulary fitted on 1,600 training reviews only.',
        training='Lowercase word unigrams; default sklearn token pattern; min_df=2; max_features=20000; TF-IDF with L2 normalization; logistic regression C=1, max_iter=1000.',
        heldout_accuracy=float(accuracy), heldout_n=len(test),
        split_sha256=hashlib.sha256('\n'.join(ids[i] for i in test).encode()).hexdigest(),
        expectations='Authored design expectations, not independent participant labels. All 24 sentences are synthetic, not Marvel quotations.',
        versions={name: version(name) for name in ['nltk', 'numpy', 'torch', 'transformers', 'scikit-learn']}))
    path = ROOT / 'data/week7_sentiment.json'
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote {path}; held-out movie review accuracy {accuracy:.3f}', flush=True)


if __name__ == '__main__':
    main()
