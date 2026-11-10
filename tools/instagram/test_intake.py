import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

spec=importlib.util.spec_from_file_location('intake',Path(__file__).with_name('intake.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name);m.CACHE=root/'cache';m.REPORTS=root/'reports';m.REPORTS.mkdir()
    def seed(self):
        job='a'*32;p=m.job_path(job);p.mkdir(parents=True);(p/'01.jpg').write_bytes(b'fixture')
        m.write_json(m.REPORTS/f'{job}.json',{'status':'awaiting_analysis','cache':str(p)})
        a=Path(self.tmp.name)/'analysis.txt';a.write_text('Observed frame description')
        return job,p,a
    def test_reject_non_post_and_host_tricks(self):
        for url in ['https://instagram.com.evil.test/p/ABCDE/','https://evil@instagram.com/p/ABCDE/','http://instagram.com/p/ABCDE/','https://instagram.com/accounts/login/','https://instagram.com/p/../../etc/passwd']:
            with self.assertRaises(ValueError):m.shortcode(url)
        self.assertEqual(m.shortcode('https://www.instagram.com/p/DZp8LxoiTg3/?igsh=example'),'DZp8LxoiTg3')
    def test_network_allowlist(self):
        for url in ['http://www.instagram.com','https://fbcdn.net.evil.test/a','https://127.0.0.1/a','https://user:pw@instagram.com','https://instagram.com:8000/a']:
            self.assertFalse(m.allowed_url(url))
        self.assertTrue(m.allowed_url('https://scontent.cdninstagram.com/a'))
    def test_finish_removes_raw_only(self):
        job,p,a=self.seed();m.finish(job,a,False)
        self.assertFalse(p.exists());r=json.loads((m.REPORTS/f'{job}.json').read_text())
        self.assertEqual(r['analysis'],a.read_text());self.assertFalse(r['media_retained'])
    def test_keep_moves_out_of_cache(self):
        job,p,a=self.seed();m.finish(job,a,True)
        self.assertFalse(p.exists());self.assertTrue((m.REPORTS/job/'01.jpg').exists())
    def test_stale_cleanup_is_scoped(self):
        job,p,a=self.seed();other=m.CACHE/'user-files';other.mkdir();old=time.time()-90000
        os.utime(p,(old,old));os.utime(other,(old,old));m.cleanup()
        self.assertFalse(p.exists());self.assertTrue(other.exists());self.assertTrue(a.exists())
    def test_symlink_and_traversal_refused(self):
        with self.assertRaises(ValueError):m.job_path('../outside')
        m.CACHE.mkdir();target=Path(self.tmp.name)/'outside';target.mkdir()
        (m.CACHE/('b'*32)).symlink_to(target)
        with self.assertRaises(ValueError):m.job_path('b'*32)
if __name__=='__main__': unittest.main()
