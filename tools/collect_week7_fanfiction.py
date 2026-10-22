"""Acquire a deterministic sample of archived completed Avengers one-shots.

Downloads only the ZIP central directory and selected compressed members using
HTTP byte ranges. Full texts remain in /private/tmp; no multi-GB ZIP download.
"""
import io,json,urllib.request,zipfile,pathlib,concurrent.futures
BASE='https://archive.org/download/fanfictiondotnet_repack/Fanfiction_A.zip'
SIZE=4037274276
CACHE=pathlib.Path('/private/tmp/week7-archive-ranges');CACHE.mkdir(exist_ok=True)
class Remote(io.RawIOBase):
 def __init__(self):self.pos=0
 def seekable(self):return True
 def tell(self):return self.pos
 def seek(self,n,whence=0):
  self.pos=n if whence==0 else self.pos+n if whence==1 else SIZE+n
  return self.pos
 def read(self,n=-1):
  n=min(SIZE-self.pos,n) if n>=0 else SIZE-self.pos
  if n<=0:return b''
  if n>100_000_000:raise ValueError('Refusing huge range '+str(n))
  start=self.pos;self.pos+=n
  def part(bounds):
   a,b=bounds
   cached=CACHE/f'{a}-{b}'
   if cached.exists():return cached.read_bytes()
   for attempt in range(4):
    try:
     req=urllib.request.Request(BASE,headers={'Range':f'bytes={a}-{b}'})
     with urllib.request.urlopen(req,timeout=35) as r:
      if r.status!=206:raise RuntimeError('Archive ignored range')
      data=r.read()
      if len(data)!=b-a+1:raise RuntimeError('Wrong length')
     cached.write_bytes(data);print('Range',a,b,'done',flush=True);return data
    except Exception as e:
     print('Range retry',a,repr(e),flush=True)
     if attempt==3:raise
  ranges=[(a,min(a+1_000_000,start+n)-1) for a in range(start,start+n,1_000_000)]
  if n>10_000_000: ranges=list(reversed(ranges))
  with concurrent.futures.ThreadPoolExecutor(max_workers=8) as p:
   pieces=list(p.map(part,ranges))
  return b''.join(pieces if n<=10_000_000 else reversed(pieces))

import hashlib,random,re,struct,zlib
from datetime import date

OUTPUT=pathlib.Path('/private/tmp/week7-arcs')
OUTPUT.mkdir(exist_ok=True)
TEXTS=OUTPUT/'texts';TEXTS.mkdir(exist_ok=True)
CURATED=json.loads((pathlib.Path(__file__).with_name('week7_story_cleanup.json')).read_text())


def extract(info):
    cached=OUTPUT/('raw-'+hashlib.sha256(info.filename.encode()).hexdigest()[:16]+'.txt')
    if cached.exists():return cached.read_text()
    f=Remote();f.seek(info.header_offset)
    data=f.read(min(SIZE-info.header_offset,30+len(info.filename.encode())+65535+info.compress_size))
    n,x=struct.unpack_from('<HH',data,26)
    payload=data[30+n+x:30+n+x+info.compress_size]
    raw=zlib.decompress(payload,-15) if info.compress_type==8 else payload
    assert len(raw)==info.file_size and zlib.crc32(raw)==info.CRC
    text=raw.decode('utf8',errors='replace');cached.write_text(text)
    return text


def eligible(info):
    try:
        raw=extract(info)
        def field(name):
            m=re.search(r'^'+re.escape(name)+r': (.*)$',raw,re.M)
            return m.group(1).strip() if m else ''
        if field('Language')!='English' or field('Status')!='Completed' or field('Chapters')!='1':return None
        if field('Rating') not in ['K','K+','T']:return None
        title,author=info.filename.rsplit('/',1)[1][:-4].removeprefix('Avengers - ').split(' - ',1)[::-1]
        heading=re.match(r'^\s*(.*?)\n+by ([^\n]+)\n',raw,re.S)
        if heading:title,author=heading.group(1).strip(),heading.group(2).strip()
        summary=raw.index('Summary:')
        start=re.search(r'\n{3,}',raw[summary:])
        if start is None:return None
        body=raw[summary+start.end():]
        paragraphs=[];removed=0
        for paragraph in re.split(r'\n\s*\n',body):
            plain=paragraph.strip().strip('*_').strip()
            if not plain or plain=='End file.' or re.fullmatch(r'[\W_]+',plain):continue
            if paragraph.startswith('\t') or plain==title:continue
            if re.match(r"(?i)^(?:a/n\b|an:|author.?s? notes?\b|disclaimer\b|i (?:do not|don't) own\b|thanks? (?:you )?for (?:reading|reviewing)|thank you for|please (?:read|review)|hope you enjoy|reviews? (?:are|please)|feedback)",plain):
                removed+=1;continue
            paragraphs.append(paragraph.replace('**','').replace('_','').strip())
        text='\n\n'.join(paragraphs)
        url=field('Story URL').replace('http:','https:')
        m=re.search(r'/s/(\d+)',url)
        if not m:return None
        # The archive's Avengers category also contains the British TV series.
        if not re.search(r'\b(?:Stark|Coulson|Rogers|Thor|Loki|Natasha|Barton|Banner|S\.H\.I\.E\.L\.D)\b',text,re.I):return None
        if re.search(r'(?i)complete["\s]+until further notice',text):return None
        cleanup=CURATED.get(m.group(1))
        if cleanup:
            assert hashlib.sha256(text.encode()).hexdigest()==cleanup['base_sha256'],'Source changed; recheck manual boundaries'
            text='\n\n'.join(paragraphs[cleanup['start']:cleanup['end']])
        text=re.sub(r'</?(?:p|br)\b[^>]*>',' ',text,flags=re.I).lstrip('>')
        words=len(text.split())
        if not 2000<=words<=8000:return None
        return dict(id=m.group(1),title=title,author=author,url=url,words=words,published=field('Published'),
                    archived=field('Packaged'),rating=field('Rating'),genre=field('Genre'),archive_path=info.filename,
                    removed_note_paragraphs=removed,text=text)
    except Exception as e:
        print('Skipped',info.filename,repr(e),flush=True);return None


def main():
    z=zipfile.ZipFile(Remote())
    candidates=sorted([i for i in z.infolist() if i.filename.startswith('Fanfiction/Avengers/Completed/') and i.filename.endswith('.txt') and 12000<i.file_size<60000],key=lambda i:i.filename)
    random.Random(42).shuffle(candidates)
    stories=[];authors=set();seen=set();examined=0
    # Fixed batches preserve sampling order despite parallel requests.
    for start in range(0,len(candidates),32):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:batch=list(pool.map(eligible,candidates[start:start+32]))
        for entry in batch:
            examined+=1
            if entry is None or entry['author'] in authors:continue
            digest=hashlib.sha256(entry['text'].encode()).hexdigest()
            if digest in seen:continue
            path=TEXTS/(entry['id']+'.txt');path.write_text(entry.pop('text'))
            entry['text_path']=str(path);stories.append(entry);authors.add(entry['author']);seen.add(digest)
            print('Selected',len(stories),entry['title'],entry['words'],flush=True)
            if len(stories)==36:break
        if len(stories)==36:break
    assert len(stories)==36,'Not enough eligible stories'
    description=(f'36 English-language Avengers one-shots from the Internet Archive fanfictiondotnet_repack collection, all marked completed in their archived metadata. Eligible ZIP members were 12–60 kB, rated K/K+/T, and 2,000–8,000 words after cleanup. Candidates were sorted by archive path and shuffled with seed 42; the first eligible work per author was retained, up to 36 stories ({examined} candidates examined). A Marvel character-name check excludes unrelated British-TV Avengers works; an explicit “complete until further notice” note is also excluded. Headers, title lines, separator lines and explicitly marked note paragraphs were removed by fixed rules. A boundary review then removed remaining opening and closing author notes, with content hashes and paragraph boundaries recorded in the cleanup manifest. Unmarked internal notes may remain. Completion is the archive’s label, not an independent reading of every ending. This historical Avengers convenience sample is not representative of Marvel fan fiction, and choosing single-chapter works excludes long-form narratives. Full texts stay in the local cache; only model scores and short source-linked excerpts are published.')
    metadata=dict(description=description,archive='https://archive.org/details/fanfictiondotnet_repack',
                  member='Fanfiction_A.zip',candidates=len(candidates),examined=examined,seed=42,acquired=str(date.today()))
    (OUTPUT/'corpus.json').write_text(json.dumps(dict(stories=stories,metadata=metadata),ensure_ascii=False,indent=2))
    print('Wrote corpus.json',flush=True)

if __name__=='__main__':main()
