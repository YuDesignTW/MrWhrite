import json
from pathlib import Path
import tempfile
import unittest
import intake
import staged

class StagedTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        base=Path(self.tmp.name)/'中文 路徑';base.mkdir()
        self.old=intake.CACHE;self.oldreports=staged.REPORTS
        intake.CACHE=base/'cache';staged.REPORTS=base/'reports'
        self.addCleanup(setattr,intake,'CACHE',self.old)
        self.addCleanup(setattr,staged,'REPORTS',self.oldreports)
        self.job='c'*32;self.root=intake.job_path(self.job);self.control=self.root/'.control';self.control.mkdir(parents=True)
        self.state={'job':self.job,'shortcode':'DZp8LxoiTg3','status':'bootstrap'}
        intake.write_json(self.control/'state.json',self.state)
    def metadata(self,post):
        intake.write_json(self.control/'metadata.json',{'data':{'xdt_api__v1__media__shortcode__web_info':{'items':[post]}}})
    def test_unicode_paths_preserved(self):
        f=self.control/'request.curl'
        staged.config(f,'https://www.instagram.com/',self.control/'page.html')
        self.assertIn('中文 路徑',f.read_text());self.assertNotIn('\\u',f.read_text())
        self.assertNotIn('location',f.read_text())
    def test_html_not_accepted_as_metadata(self):
        (self.control/'metadata.json').write_text('<html>Instagram</html>')
        with self.assertRaises(ValueError):staged.prepare_media(self.job)
    def test_other_post_rejected(self):
        self.metadata({'code':'OTHER123'})
        with self.assertRaises(ValueError):staged.prepare_media(self.job)
    def test_incomplete_carousel_rejected(self):
        self.metadata({'code':'DZp8LxoiTg3','media_type':8,'carousel_media_count':6,'carousel_media':[{}]})
        with self.assertRaises(ValueError):staged.prepare_media(self.job)
    def test_untrusted_media_host_rejected(self):
        self.metadata({'code':'DZp8LxoiTg3','media_type':1,'image_versions2':{'candidates':[{'url':'https://evil.test/a.jpg'}]}})
        with self.assertRaises(ValueError):staged.prepare_media(self.job)
    def test_html_download_not_success_even_with_http_200(self):
        self.state.update(status='downloading',media=[{'name':'01.jpg','type':'image/jpeg'}])
        intake.write_json(self.control/'state.json',self.state)
        (self.root/'01.jpg').write_text('<html>login</html>')
        (self.root/'01.jpg.headers').write_text('HTTP/2 200\ncontent-type: image/jpeg\n')
        with self.assertRaises(ValueError):staged.finalize(self.job)
        self.assertTrue(self.control.exists())
    def test_missing_anonymous_tokens_refused(self):
        (self.control/'page.html').write_text('<html></html>')
        with self.assertRaises(ValueError):staged.query(self.job)
    def test_authenticated_cookie_refused(self):
        (self.control/'page.html').write_text('"LSD",[],{"token":"anon"} "IG_USER_EIMU":"0"')
        (self.control/'anonymous.cookies').write_text('.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tfixture')
        with self.assertRaises(ValueError):staged.query(self.job)
if __name__=='__main__':unittest.main()
