"""Render a bounded visual sample; stdout is the receipt, never inferred style."""
import sys, json, pathlib
import fitz
source, target = map(pathlib.Path, sys.argv[1:3])
target.mkdir(parents=True, exist_ok=True)
with fitz.open(source) as doc:
    if doc.needs_pass:
        raise ValueError('PDF 有密碼，請提供可讀取版本')
    count = doc.page_count
    if not 0 < count <= 1000:
        raise ValueError('文件頁數必須介於 1 至 1000')
    selected = list(range(count)) if count <= 6 else sorted(set(round(i*(count-1)/5) for i in range(6)))
    pages = []
    for i in selected:
        page = doc[i]
        longest = max(page.rect.width, page.rect.height)
        if longest <= 0:
            raise ValueError('無效頁面尺寸')
        pix = page.get_pixmap(matrix=fitz.Matrix(1400/longest, 1400/longest), colorspace=fitz.csRGB, alpha=False)
        filename = f'page-{i+1}.png'
        pix.save(target / filename)
        pages.append({'page':i+1, 'filename':filename, 'text':page.get_text()[:1500]})
    print(json.dumps({'pageCount':count, 'pages':pages}, ensure_ascii=False))
