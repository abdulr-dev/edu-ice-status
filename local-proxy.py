#!/usr/bin/env python3
"""
Simple local CORS proxy for development
Run this script: python3 local-proxy.py
Then open index.html in your browser
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
import ssl
import json

# Import token from config.js equivalent
# For Python, we'll read from a config file or use environment variable
import os

# Try to read from environment variable first, then use default
AUTH_TOKEN = os.environ.get('AUTH_TOKEN', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFiZHVsLnJAdHVyaW5nLmNvbSIsInN1YiI6OTk3LCJpYXQiOjE3NjgzMTU2OTksImV4cCI6MTc2ODkyMDQ5OX0.AXcNSKQ0KqZPPfYjLgrHxOKCfMGzcdQyoP7-5n1M2v8')

class ProxyHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def log_message(self, format, *args):
        # Custom logging to show requests
        print(f"[{self.log_date_time_string()}] {format % args}")

    def do_GET(self):
        # Strip query string for static file matching
        path_without_query = self.path.split('?')[0]

        # Serve static files
        if path_without_query == '/' or path_without_query == '/index.html':
            self.serve_file('index.html', 'text/html')
            return
        elif path_without_query == '/styles.css':
            self.serve_file('styles.css', 'text/css')
            return
        elif path_without_query == '/script.js':
            self.serve_file('script.js', 'application/javascript')
            return
        elif path_without_query == '/config.js':
            self.serve_file('config.js', 'application/javascript')
            return
        elif path_without_query == '/script-simple.js':
            self.serve_file('script-simple.js', 'application/javascript')
            return
        elif path_without_query == '/test.html':
            self.serve_file('test.html', 'text/html')
            return
        elif path_without_query == '/favicon.ico':
            self.send_response(204)  # No content
            self.end_headers()
            return
        elif self.path.startswith('/api/'):
            # The path is /api/conversations?... - we need to forward to labeling-g.turing.com/api/conversations
            # Keep the full path as-is (including /api)
            api_url = f'https://labeling-g.turing.com{self.path}'

            print(f"Proxying request to: {api_url}")

            try:
                # Create SSL context that doesn't verify certificates (for local dev only)
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE

                # Create request with headers
                req = urllib.request.Request(api_url)
                req.add_header('authorization', f'Bearer {AUTH_TOKEN}')
                req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')
                req.add_header('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143"')
                req.add_header('sec-ch-ua-mobile', '?0')
                req.add_header('sec-ch-ua-platform', '"macOS"')
                req.add_header('DNT', '1')
                req.add_header('x-app-version', '9c76935')

                # Make request with SSL context
                with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
                    data = response.read()
                    status_code = response.getcode()
                    content_type = response.headers.get('Content-Type', 'unknown')

                    # Log response info
                    print(f"API Response: {status_code}, Content-Type: {content_type}")
                    if status_code == 200:
                        try:
                            # Try to parse as JSON to verify it's valid
                            json_data = json.loads(data.decode('utf-8'))
                            print(f"Valid JSON response, data keys: {list(json_data.keys()) if isinstance(json_data, dict) else 'array'}")
                        except:
                            print(f"Warning: Response is not valid JSON. First 200 chars: {data[:200].decode('utf-8', errors='ignore')}")

                    self.send_response(status_code)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                    self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
                    # Use the actual content type from the API response
                    self.send_header('Content-Type', content_type)
                    self.end_headers()
                    self.wfile.write(data)
                    print(f"Success: {status_code}")
            except urllib.error.HTTPError as e:
                print(f"HTTP Error: {e.code} - {e.reason}")
                error_body = e.read() if hasattr(e, 'read') else b''
                self.send_response(e.code)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                if error_body:
                    self.wfile.write(error_body)
                else:
                    self.wfile.write(json.dumps({'error': f'HTTP {e.code}: {e.reason}'}).encode())
            except urllib.error.URLError as e:
                print(f"URL Error: {e.reason}")
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Connection error: {str(e.reason)}'}).encode())
            except Exception as e:
                print(f"Error: {type(e).__name__}: {str(e)}")
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e), 'type': type(e).__name__}).encode())
        else:
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'Not found. Use /api/ for API requests.')

    def serve_file(self, filename, content_type):
        """Serve static files from the current directory"""
        import os
        try:
            filepath = os.path.join(os.path.dirname(__file__), filename)
            with open(filepath, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(content))
            # Disable caching for development
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(f'File not found: {filename}'.encode())

if __name__ == '__main__':
    port = 3000
    server = HTTPServer(('localhost', port), ProxyHandler)
    print(f'🚀 Local server running on http://localhost:{port}')
    print(f'')
    print(f'📝 Open in your browser: http://localhost:{port}')
    print(f'')
    print(f'🔗 API requests will be proxied through http://localhost:{port}/api/')
    print(f'Press Ctrl+C to stop')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n👋 Server stopped')
        server.shutdown()