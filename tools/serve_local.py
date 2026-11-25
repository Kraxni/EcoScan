"""Local static server with single byte-range support for native MP4 chapter tests,
and gzip for text files (HTML, CSS, JS, SVG…) so local measurements match GitHub Pages.
Standard library only; never used by GitHub Pages production.
"""
import argparse
import functools
import gzip
import http.server
import io
import os
import re

TEXT_SUFFIXES = {'.html', '.css', '.js', '.mjs', '.svg', '.json', '.vtt', '.xml', '.txt', '.webmanifest'}
_gzip_cache = {}

def gzipped(path):
    """Contenu compressé du fichier, mis en cache tant que le fichier ne change pas (comme GitHub Pages)."""
    stat = os.stat(path)
    key = (path, stat.st_mtime_ns, stat.st_size)
    if key not in _gzip_cache:
        with open(path, 'rb') as source:
            _gzip_cache[key] = gzip.compress(source.read(), compresslevel=6, mtime=0)
    return _gzip_cache[key]

class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        self._remaining = None
        header = self.headers.get('Range')
        path = self.translate_path(self.path)
        if os.path.isdir(path) and self.path.split('?')[0].endswith('/'):
            path = os.path.join(path, 'index.html')
        if (not header and os.path.isfile(path) and os.path.splitext(path)[1].lower() in TEXT_SUFFIXES
                and 'gzip' in self.headers.get('Accept-Encoding', '')):
            body = gzipped(path)
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Last-Modified', self.date_time_string(os.stat(path).st_mtime))
            self.end_headers()
            return io.BytesIO(body)
        path = self.translate_path(self.path)
        if not header or not os.path.isfile(path):
            return super().send_head()
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip())
        size = os.path.getsize(path)
        if not match or not any(match.groups()) or not size:
            self.send_error(416, 'Unsupported byte range')
            return None
        first, last = match.groups()
        if first:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        else:
            start, end = max(0, size - int(last)), size - 1
        if start >= size or end < start:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        source = open(path, 'rb')
        source.seek(start)
        self._remaining = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self._remaining))
        self.end_headers()
        return source

    def copyfile(self, source, output):
        if self._remaining is None:
            return super().copyfile(source, output)
        remaining = self._remaining
        while remaining:
            chunk = source.read(min(65536, remaining))
            if not chunk:
                break
            try:
                output.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break
            remaining -= len(chunk)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', default='.')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    handler = functools.partial(RangeHandler, directory=args.directory)
    http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler).serve_forever()
