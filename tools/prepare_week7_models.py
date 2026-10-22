"""Fetch pinned pretrained files into local temporary caches (standard library only)."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen


def fetch(url, destination):
    if destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(Request(url, headers={'Range': 'bytes=0-0'}), timeout=60) as response:
        content_range = response.headers.get('Content-Range')
        if content_range:
            size = int(content_range.split('/')[-1])
        else:
            destination.write_bytes(response.read())
            return
    def chunk(i):
        step = (size + 7) // 8
        start, end = i * step, min(size, (i + 1) * step) - 1
        for attempt in range(3):
            try:
                with urlopen(Request(url, headers={'Range': f'bytes={start}-{end}'}), timeout=60) as response:
                    assert response.status == 206
                    data = response.read()
                assert len(data) == end - start + 1
                return data
            except Exception:
                if attempt == 2:
                    raise
    with ThreadPoolExecutor(max_workers=8) as pool:
        parts = list(pool.map(chunk, range(8)))
    temporary = destination.with_suffix(destination.suffix + '.download')
    temporary.write_bytes(b''.join(parts))
    temporary.rename(destination)
    print('Fetched', destination, flush=True)


if __name__ == '__main__':
    base = 'https://huggingface.co/Uberduck/torchmoji/resolve/ff04492fe67db898d9bcbd923ee1192646132286/'
    fetch(base + 'pytorch_model.bin', Path('/private/tmp/week7-arcs/torchmoji.bin'))
    fetch(base + 'vocabulary.json', Path('/private/tmp/week7-arcs/vocabulary.json'))
    base = 'https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english/resolve/714eb0fa89d2f80546fda750413ed43d93601a13/'
    for name in ['config.json', 'tokenizer_config.json', 'vocab.txt', 'model.safetensors']:
        fetch(base + name, Path('/private/tmp/week7-model') / name)
