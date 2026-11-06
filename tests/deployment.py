"""Verify .gitignore and .htaccess against a temporary Apache HTTPS server.

Uses fixture files, not private configuration or a production website.
Needs Apache 2.4 modules and OpenSSL. Override HUB_APACHE_BIN / HUB_APACHE_MODULES
when using an extracted runtime. PHP execution is covered by the separate smoke
and browser suites; the PHP-named fixture here checks only HTTP cache policy.
"""
import gzip
import os
from pathlib import Path
import pwd
import grp
import shutil
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]


def gitignore_checks():
    ignored = ['hub-private.php', 'nested/hub-private.php', '.env', '.env.production',
               'config.local.php', 'config.production.php', 'config.secret.php',
               'nested/backup.sql', 'database.sql.gz', 'backups/site.zip',
               'deploy.zip', 'server.key', 'storage/session', 'site.log',
               '.user.ini', '.htpasswd', '.netrc', '.npmrc']
    public = ['config.php', 'config.example.php', 'hub-private.example.php',
              'database.sql', '.env.example', 'api.php', 'index.html', 'app.js',
              '.htaccess', 'DEPLOYMENT.md']
    for filename in ignored + public:
        result = subprocess.run(['git', 'check-ignore', '--no-index', '-q', filename], cwd=ROOT)
        assert result.returncode == (0 if filename in ignored else 1), filename
    print('PASS: Git ignores runtime secrets, dumps, backups; retains safe loaders and templates')


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, target):
        return None


def apache_checks():
    apache = os.environ.get('HUB_APACHE_BIN') or shutil.which('apache2') or shutil.which('httpd')
    if not apache:
        raise RuntimeError('Apache is required to validate rewrite and cache behavior')
    modules = Path(os.environ.get('HUB_APACHE_MODULES', '/usr/lib/apache2/modules'))
    with tempfile.TemporaryDirectory(prefix='life-hub-apache-') as directory:
        root = Path(directory)
        site = root / 'site'
        site.mkdir()
        for filename in ['.htaccess', 'index.html', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png']:
            shutil.copyfile(ROOT / filename, site / filename)
        for filename in ['config.php', 'config.example.php', 'hub-private.php', 'hub-private.example.php', 'config.php~', '.env', 'database.sql', 'DriveUploader.gs', 'DEPLOYMENT.md', 'snapshot.zip', 'README.md']:
            (site / filename).write_text('DENIED_FIXTURE_NOT_A_SECRET', encoding='utf8')
        for folder in ['.git', 'tests', 'docs', 'backups', 'secrets', 'empty', '.well-known/acme-challenge']:
            (site / folder).mkdir(parents=True, exist_ok=True)
        for filename in ['.git/config', 'tests/frontend.cjs', 'docs/note.txt', 'backups/data.txt', 'secrets/key.txt']:
            (site / filename).write_text('DENIED_FIXTURE_NOT_A_SECRET', encoding='utf8')
        (site / '.well-known/acme-challenge/fixture').write_text('certificate-challenge-fixture')
        (site / 'api.php').write_text('{"fixture":"cache-header-only"}')
        certificate = root / 'test.crt'
        key = root / 'test.key'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                        '-keyout', str(key), '-out', str(certificate), '-days', '1',
                        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        http_port, https_port = free_port(), free_port()
        loaded = ['mpm_event', 'authz_core', 'authz_host', 'dir', 'mime', 'headers',
                  'expires', 'filter', 'deflate', 'rewrite', 'socache_shmcb', 'ssl']
        config = '\n'.join([
            f'ServerRoot "{root}"', 'ServerName localhost', f'PidFile "{root / "httpd.pid"}"',
            f'Listen 127.0.0.1:{http_port}', f'Listen 127.0.0.1:{https_port}',
            *[f'LoadModule {name}_module "{modules / ("mod_" + name + ".so")}"' for name in loaded],
            f'User {pwd.getpwuid(os.getuid()).pw_name}', f'Group {grp.getgrgid(os.getgid()).gr_name}',
            f'ErrorLog "{root / "error.log"}"', 'LogLevel warn',
            'TypesConfig /etc/mime.types', f'DocumentRoot "{site}"',
            '<Directory />', 'Require all denied', '</Directory>',
            f'<Directory "{site}">', 'AllowOverride All', 'Require all granted', '</Directory>',
            f'<VirtualHost 127.0.0.1:{https_port}>', 'ServerName localhost', 'SSLEngine on',
            f'SSLCertificateFile "{certificate}"', f'SSLCertificateKeyFile "{key}"', '</VirtualHost>',
        ])
        config_path = root / 'httpd.conf'
        config_path.write_text(config)
        subprocess.run([apache, '-t', '-f', str(config_path)], check=True)
        server = subprocess.Popen([apache, '-DFOREGROUND', '-f', str(config_path)], stdout=subprocess.DEVNULL)
        context = ssl.create_default_context(cafile=str(certificate))
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(), urllib.request.HTTPSHandler(context=context))

        def request(path='/', https=True, headers=None, data=None):
            url = f'{"https" if https else "http"}://localhost:{https_port if https else http_port}{path}'
            req = urllib.request.Request(url, headers=headers or {}, data=data)
            try:
                response = opener.open(req, timeout=5)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                return response.status, response.headers, response.read()

        try:
            for _ in range(60):
                try:
                    if request()[0] == 200:
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise AssertionError((root / 'error.log').read_text())
            code, headers, body = request('/index.html?from=http', https=False, headers={'Host': 'localhost', 'X-Forwarded-Proto': 'https'})
            assert code == 308 and headers['Location'] == 'https://localhost/index.html?from=http', (code, headers)
            assert request('/api.php?action=login', https=False, data=b'{}')[0] == 308
            blocked = ['/.git/config', '/.env', '/config.php', '/config.example.php', '/hub-private.php',
                       '/hub-private.example.php', '/database.sql', '/DriveUploader.gs', '/README.md',
                       '/DEPLOYMENT.md', '/snapshot.zip', '/config.php~', '/tests/frontend.cjs', '/docs/note.txt',
                       '/backups/data.txt', '/secrets/key.txt', '/empty/']
            for filename in blocked:
                code, _, body = request(filename)
                assert code in (403, 404) and b'DENIED_FIXTURE_NOT_A_SECRET' not in body, (filename, code)
            assert request('/.well-known/acme-challenge/fixture')[0] == 200
            for filename in ['/', '/index.html', '/sw.js', '/manifest.webmanifest']:
                code, headers, _ = request(filename)
                policy = ','.join(headers.get_all('Cache-Control', []))
                assert code == 200 and 'no-cache' in policy and 'max-age=3600' not in policy, (filename, policy)
            _, headers, _ = request('/api.php?action=export')
            assert 'no-store' in ','.join(headers.get_all('Cache-Control', []))
            _, headers, body = request('/app.js', headers={'Accept-Encoding': 'gzip'})
            assert 'max-age=3600' in ','.join(headers.get_all('Cache-Control', []))
            assert headers['Content-Encoding'] == 'gzip'
            assert b'use strict' in gzip.decompress(body)
            assert headers['X-Content-Type-Options'] == 'nosniff'
            assert headers['X-Frame-Options'] == 'DENY'
            _, headers, _ = request('/icon-192.png')
            assert 'max-age=604800' in ','.join(headers.get_all('Cache-Control', []))
            _, headers, _ = request('/manifest.webmanifest')
            assert 'application/manifest+json' in headers['Content-Type']
            print('PASS: Apache HTTPS 308, spoofed forwarding header rejected, sensitive paths denied, directory listing disabled, ACME allowed, cache policy and gzip')
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == '__main__':
    gitignore_checks()
    apache_checks()
