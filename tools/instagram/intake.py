"""Bounded anonymous single-post pilot. No browser, cookies, sessions or login.
This is a local CLI prototype, not a security sandbox or app integration.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import signal
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
MEDIA_ROOT = Path(os.environ['MR_WHITE_MEDIA_DIR']).resolve() if os.environ.get('MR_WHITE_MEDIA_DIR') else None
CACHE = MEDIA_ROOT / 'cache' if MEDIA_ROOT else ROOT / '.cache' / 'instagram-intake'
REPORTS = MEDIA_ROOT / 'reports' if MEDIA_ROOT else ROOT / 'output' / 'instagram-intake'
MAX_BYTES = 200 * 1024 * 1024

def shortcode(url):
    p = urlsplit(url)
    if p.scheme != 'https' or p.netloc not in ('instagram.com', 'www.instagram.com'):
        raise ValueError('Only HTTPS instagram.com single-post links are accepted')
    m = re.fullmatch(r'/(?:p|reel)/([A-Za-z0-9_-]{5,32})/?', p.path)
    if not m:
        raise ValueError('Expected a single post or reel URL')
    return m[1]

def allowed_url(url):
    p = urlsplit(url)
    h = p.hostname or ''
    return (p.scheme == 'https' and not p.username and not p.password
            and p.port in (None, 443)
            and any(h == d or h.endswith('.' + d) for d in ('instagram.com', 'cdninstagram.com', 'fbcdn.net')))

def job_path(job):
    if not re.fullmatch('[0-9a-f]{32}', job):
        raise ValueError('Invalid job ID')
    p = CACHE / job
    if CACHE.is_symlink() or p.is_symlink():
        raise ValueError('Symlink cache refused')
    return p

def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def cleanup():
    if CACHE.is_symlink():
        raise ValueError('Symlink cache refused')
    if CACHE.exists():
        for p in CACHE.iterdir():
            if re.fullmatch('[0-9a-f]{32}', p.name) and not p.is_symlink() and p.is_dir():
                if time.time() - p.stat().st_mtime > 86400:
                    shutil.rmtree(p)

def fetch(url):
    code = shortcode(url)
    cleanup()
    import instaloader
    import requests
    # Guard every requests send, including redirects and Instaloader-created sessions.
    original_send = requests.Session.send
    def guarded_send(session, request, **kw):
        if not allowed_url(request.url):
            raise ValueError('Network destination rejected')
        kw['verify'] = True
        kw['proxies'] = {}
        kw['timeout'] = 20
        session.trust_env = False
        return original_send(session, request, **kw)
    requests.Session.send = guarded_send
    def timeout(*_):
        raise TimeoutError('Job exceeded 120 seconds')
    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(120)
    job = uuid.uuid4().hex
    dest = job_path(job)
    dest.mkdir(parents=True, mode=0o700)
    REPORTS.mkdir(parents=True, exist_ok=True)
    report = {'job': job, 'url': f'https://www.instagram.com/p/{code}/',
              'tool': 'instaloader==4.16', 'authenticated': False,
              'created_at': time.time(), 'status': 'fetching'}
    try:
        with instaloader.Instaloader(quiet=True, max_connection_attempts=1,
                request_timeout=20, fatal_status_codes=[401,403,429],
                iphone_support=False) as loader:
            loader.context._session.trust_env = False
            post = instaloader.Post.from_shortcode(loader.context, code)
            caption = post.caption or ''
            if post.typename == 'GraphSidecar':
                nodes = list(post.get_sidecar_nodes())
                media = [(n.video_url if n.is_video else n.display_url, n.is_video) for n in nodes]
            else:
                media = [(post.video_url if post.is_video else post.url, post.is_video)]
            if not media or len(media) > 20:
                raise ValueError('Unexpected media count')
            files, total = [], 0
            with requests.Session() as session:
                session.trust_env = False
                for i, (media_url, video) in enumerate(media, 1):
                    with session.get(media_url, stream=True) as response:
                        response.raise_for_status()
                        mime = response.headers.get('Content-Type','').split(';')[0]
                        ext = {'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','video/mp4':'.mp4'}.get(mime)
                        if not ext or (video != (mime == 'video/mp4')):
                            raise ValueError('Unexpected media type')
                        target = dest / f'{i:02}{ext}'
                        digest = hashlib.sha256()
                        with target.open('xb') as f:
                            for chunk in response.iter_content(65536):
                                total += len(chunk)
                                if total > MAX_BYTES:
                                    raise ValueError('Job exceeded 200 MiB')
                                digest.update(chunk)
                                f.write(chunk)
                        files.append({'order':i, 'name':target.name, 'type':mime, 'sha256':digest.hexdigest()})
            report.update(status='awaiting_analysis', caption=caption, media=files,
                          media_bytes=total, cache=str(dest), retention='delete on finish unless --keep-media; 24h stale cleanup on next command')
            write_json(dest / 'manifest.json', report)
    except Exception as exc:
        # Avoid dumping signed media URLs or raw server responses into persistent logs.
        detail = str(exc).lower()
        reason = ('network_resolution' if any(x in detail for x in ('resolve', 'name resolution', 'nodename', 'getaddrinfo'))
                  else 'login_required' if 'login' in detail else 'rate_limited' if '429' in detail
                  else 'access_denied' if any(x in detail for x in ('401', '403')) else 'download_error')
        report.update(status='failed', error_type=type(exc).__name__, reason=reason)
        shutil.rmtree(dest)
    finally:
        signal.alarm(0)
        requests.Session.send = original_send
    write_json(REPORTS / f'{job}.json', report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['status'] == 'awaiting_analysis' else 1

def finish(job, analysis_file, keep):
    dest = job_path(job)
    report_path = REPORTS / f'{job}.json'
    report = json.loads(report_path.read_text())
    if report['status'] != 'awaiting_analysis' or not dest.is_dir():
        raise ValueError('No fetched media awaiting analysis')
    analysis = Path(analysis_file).read_text(encoding='utf-8')
    if not analysis.strip():
        raise ValueError('Analysis must not be empty')
    report.update(status='analyzed', analysis=analysis, media_retained=keep)
    if keep:
        target = REPORTS / job
        if target.exists():
            raise ValueError('Retained output already exists')
        shutil.move(str(dest), str(target))
        report['cache'] = str(target)
    else:
        shutil.rmtree(dest)
        report.pop('cache', None)
    write_json(report_path, report)
    print(f'Analysis saved; media {"retained" if keep else "deleted"}.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    f = sub.add_parser('fetch'); f.add_argument('url')
    f = sub.add_parser('finish'); f.add_argument('job'); f.add_argument('--analysis-file', required=True); f.add_argument('--keep-media', action='store_true')
    sub.add_parser('cleanup')
    args = parser.parse_args()
    if args.command == 'fetch': raise SystemExit(fetch(args.url))
    elif args.command == 'finish': finish(args.job, args.analysis_file, args.keep_media)
    else: cleanup()
