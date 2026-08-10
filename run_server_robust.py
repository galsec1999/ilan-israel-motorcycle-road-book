import http.server
import socketserver
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

app_dir = r'd:/Michael2015/אופנוע/ספר_של_אילן_לטיולי_הכביש_לאופנועים_בישראל/אפליקציה_להתקנה_באינטרנט'
os.chdir(app_dir)

class RobustNoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

PORT = 8085
socketserver.TCPServer.allow_reuse_address = True

print(f"Starting server in {app_dir} on port {PORT}...")
httpd = socketserver.TCPServer(("", PORT), RobustNoCacheHandler)
httpd.serve_forever()
