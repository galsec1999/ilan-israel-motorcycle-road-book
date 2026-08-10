import http.server
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

app_dir = r'd:/Michael2015/אופנוע/ספר_של_אילן_לטיולי_הכביש_לאופנועים_בישראל/אפליקציה_להתקנה_באינטרנט'
os.chdir(app_dir)

class MultiThreadedNoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        pass

PORT = 8085

if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(('', PORT), MultiThreadedNoCacheHandler)
    print(f"MultiThreaded HTTP Server running at http://localhost:{PORT}")
    server.serve_forever()
