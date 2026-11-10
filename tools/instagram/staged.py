"""Anonymous curl transport for environments permitting curl but not Python networking.
Prepare requests locally, execute the printed curl commands, then validate results.
No shell evaluation, browser state, third-party service or authenticated cookies.
"""
import argparse
import json
import re
import shutil
import uuid
import time
from pathlib import Path
from urllib.parse import urlencode
from intake import ROOT, REPORTS, shortcode, allowed_url, job_path, write_json, MAX_BYTES

DOC_ID = '27128499623469141'  # Instaloader v4.16 Post._obtain_metadata

def config(path, url, output, *, headers=None, body=None, cookies=None, jar=None, limit=10_000_000):
    if not allowed_url(url):
        raise ValueError('Unapproved request destination')
    # Curl config strings are quoted, never interpolated as shell commands.
    args = [('url',url),('output',str(output)),('max-time','30'),
            ('max-filesize',str(limit)),('proto','=https'),('proto-redir','=https'),
            ('dump-header',str(output)+'.headers')]
    if headers:
        args.append(('header','@'+str(headers)))
    if body:
        args.append(('data-binary','@'+str(body)))
    if cookies:
        args.append(('cookie',str(cookies)))
    if jar:
        args.append(('cookie-jar',str(jar)))
    # No automatic redirects: validate any new destination before another request.
    text = 'silent\nshow-error\nfail\n'
    text += '\n'.join(k+' = '+json.dumps(v, ensure_ascii=False) for k,v in args)+'\n'
    path.write_text(text)
    path.chmod(0o600)

def load(job):
    root = job_path(job)
    return root, root/'.control', json.loads((root/'.control/state.json').read_text())

def bootstrap(url):
    code=shortcode(url); job=uuid.uuid4().hex; root=job_path(job)
    control=root/'.control';control.mkdir(parents=True,mode=0o700);root.chmod(0o700)
    state={'job':job,'shortcode':code,'url':f'https://www.instagram.com/p/{code}/',
           'created_at':time.time(),'tool':'instaloader==4.16 protocol / curl transport',
           'authenticated':False,'status':'bootstrap'}
    write_json(control/'state.json',state)
    config(control/'bootstrap.curl','https://www.instagram.com/',control/'page.html',jar=control/'anonymous.cookies')
    print(job); print(control/'bootstrap.curl')
    return job

def query(job):
    root,c,state=load(job)
    page=(c/'page.html').read_text()
    fields={'doc_id':DOC_ID,'variables':json.dumps({'shortcode':state['shortcode'],
        '__relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider':False}), 'server_timestamps':'true'}
    for key,pattern in [('lsd',r'"LSD",\[\],\{[^{}]*"token":"([^"]+)"'),('av',r'"IG_USER_EIMU":"?(\d+)')]:
        m=re.search(pattern,page)
        if not m:raise ValueError('Public page is missing required anonymous tokens')
        fields[key]=m.group(1)
    headers=['Content-Type: application/x-www-form-urlencoded','X-IG-App-ID: 936619743392459',
        'Referer: https://www.instagram.com/','Sec-Fetch-Dest: empty','Sec-Fetch-Mode: cors',
        'Sec-Fetch-Site: same-origin','X-FB-LSD: '+fields['lsd']]
    for line in (c/'anonymous.cookies').read_text().splitlines():
        parts=line.split('\t')
        if len(parts)==7 and parts[-2]=='sessionid':raise ValueError('Authenticated cookies refused')
        if len(parts)==7 and parts[-2]=='csrftoken':headers.append('X-CSRFToken: '+parts[-1])
    (c/'query.form').write_text(urlencode(fields));(c/'query.headers').write_text('\n'.join(headers)+'\n')
    config(c/'query.curl','https://www.instagram.com/api/graphql',c/'metadata.json',
           headers=c/'query.headers',body=c/'query.form',cookies=c/'anonymous.cookies')
    print(c/'query.curl')

def prepare_media(job):
    root,c,state=load(job)
    data=json.loads((c/'metadata.json').read_text().removeprefix('for (;;);'))
    items=((data.get('data')or{}).get('xdt_api__v1__media__shortcode__web_info')or{}).get('items')or[]
    if len(items)!=1 or items[0].get('code')!=state['shortcode']:
        raise ValueError('Metadata missing or belongs to another post')
    post=items[0];nodes=post.get('carousel_media') if post.get('media_type')==8 else [post]
    if not nodes or not 1<=len(nodes)<=20:raise ValueError('Invalid carousel count')
    expected=post.get('carousel_media_count')
    if expected is not None and expected!=len(nodes):raise ValueError('Incomplete carousel metadata')
    media=[]
    for i,node in enumerate(nodes,1):
        kind=node.get('media_type')
        if kind not in (1,2):raise ValueError('Unsupported media type')
        video=kind==2
        candidates=(node.get('video_versions')or[]) if video else ((node.get('image_versions2')or{}).get('candidates')or[])
        if not candidates:raise ValueError('No downloadable candidates')
        chosen=max(candidates,key=lambda x:(x.get('width',0)*x.get('height',0)))
        url=chosen['url']
        if not allowed_url(url):raise ValueError('Unapproved media URL')
        name=f'{i:02}.mp4' if video else f'{i:02}.jpg'
        config(c/f'{i:02}.curl',url,root/name,limit=MAX_BYTES//len(nodes))
        media.append({'order':i,'name':name,'type':'video/mp4' if video else 'image/jpeg',
                      'width':chosen.get('width'),'height':chosen.get('height')})
    state.update(status='downloading',caption=(post.get('caption')or{}).get('text',''),
                 author=(post.get('user')or{}).get('username'), publishedAt=post.get('taken_at'),
                 media=media,expected_count=len(nodes),cache=str(root))
    write_json(c/'state.json',state)
    print(json.dumps({'job':job,'media':media},ensure_ascii=False,indent=2))

def finalize(job):
    import hashlib
    root,c,state=load(job)
    if state.get('status')!='downloading':raise ValueError('Job not ready for validation')
    total=0
    for item in state['media']:
        f=root/item['name']; size=f.stat().st_size;total+=size
        if not size or total>MAX_BYTES:raise ValueError('Empty or oversized download')
        head=f.read_bytes()[:32]
        valid=(head[:3]==b'\xff\xd8\xff') if item['type']=='image/jpeg' else (head[4:8]==b'ftyp')
        if not valid:raise ValueError('Media signature mismatch')
        headers=Path(str(f)+'.headers').read_text()
        statuses=re.findall(r'^HTTP/\S+ (\d+)',headers,re.M)
        if not statuses or statuses[-1]!='200':raise ValueError('Download response not successful')
        content_types=re.findall(r'^content-type:\s*([^;\r\n]+)',headers,re.I|re.M)
        if not content_types or content_types[-1].strip()!=item['type']:raise ValueError('Media MIME mismatch')
        item.update(bytes=size,sha256=hashlib.file_digest(f.open('rb'),'sha256').hexdigest())
    state.update(status='awaiting_analysis',media_bytes=total,
                 retention='delete on finish unless --keep-media; 24h stale cleanup on next command')
    REPORTS.mkdir(parents=True,exist_ok=True)
    write_json(root/'manifest.json',state);write_json(REPORTS/f'{job}.json',state)
    # Remove transient anonymous cookies, request tokens, signed URLs and HTTP headers.
    shutil.rmtree(c)
    for item in state['media']:Path(str(root/item['name'])+'.headers').unlink()
    print(json.dumps(state,ensure_ascii=False,indent=2))

def download(url):
    import contextlib
    import io
    import subprocess
    import signal
    job = None
    previous = signal.getsignal(signal.SIGALRM)
    def expired(*_): raise TimeoutError('Download exceeded 180 seconds')
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(180)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            job = bootstrap(url)
            root,c,state = load(job)
            def transfer(name):
                subprocess.run(['curl','--disable','--proxy','','--config',str(c/name)],
                    check=True, timeout=35, capture_output=True)
            transfer('bootstrap.curl')
            query(job)
            transfer('query.curl')
            prepare_media(job)
            root,c,state = load(job)
            for item in state['media']:
                transfer(f"{item['order']:02}.curl")
            finalize(job)
        print((REPORTS / f'{job}.json').read_text())
    except Exception as exc:
        if job:
            shutil.rmtree(job_path(job), ignore_errors=True)
        # Do not log anonymous tokens, signed URLs, cookies or response bodies.
        raise RuntimeError('Instagram 下載未完成：' + type(exc).__name__) from None
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('stage',choices=['bootstrap','query','media','finalize','download']);p.add_argument('value');a=p.parse_args()
    {'bootstrap':bootstrap,'query':query,'media':prepare_media,'finalize':finalize,'download':download}[a.stage](a.value)
