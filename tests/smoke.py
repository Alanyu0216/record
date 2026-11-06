"""Integration checks for a disposable Life Hub database (Python 3 stdlib)."""
import copy
import getpass
import http.cookiejar
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid


class Client:
    def __init__(self, base):
        self.base = base.rstrip('/') + '/api.php'
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(self.jar)
        )
        self.csrf = ''

    def call(self, action, body=None, expected=200, csrf=True, **query):
        url = self.base + '?' + urllib.parse.urlencode(dict(action=action, **query))
        headers = {'Content-Type': 'application/json'}
        if csrf:
            headers['X-CSRF-Token'] = self.csrf
        request = urllib.request.Request(
            url, data=None if body is None else json.dumps(body).encode(), headers=headers
        )
        try:
            response = self.opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            payload = json.load(response)
            assert response.status == expected, (action, response.status, payload)
        if 'csrf_token' in payload:
            self.csrf = payload['csrf_token']
        return payload


def main():
    base = os.environ.get('HUB_TEST_URL', 'http://127.0.0.1:8080')
    password = os.environ.get('HUB_TEST_PASSWORD') or getpass.getpass('Test login password: ')
    client = Client(base)
    records = []
    original_settings = None
    marker = '验证耳机_' + uuid.uuid4().hex
    client.call('session')
    client.call('list', expected=401)
    client.call('login', {'password': password}, csrf=False, expected=403)
    client.call('login', {'password': password})
    try:
        schema = client.call('schema')['modules']
        assert len(schema) == 8
        settings = client.call('settings')
        original_settings = copy.deepcopy(settings['settings'])
        rates = dict(original_settings['rates_to_sgd'])
        rates.setdefault('MYR', '0.30')
        updated = client.call('settings_update', {
            'base_currency': 'MYR', 'rates_to_sgd': rates, 'version': settings['version']
        })
        assert updated['settings']['base_currency'] == 'MYR'
        client.call('settings_update', {
            'base_currency': 'MYR', 'rates_to_sgd': rates, 'version': settings['version']
        }, expected=409)
        for module, fields in schema.items():
            data = {}
            for key, rule in fields.items():
                kind = rule[0]
                if kind == 'text':
                    data[key] = marker if key in ('name', 'location') else '测试备注'
                elif kind == 'currency':
                    data[key] = 'SGD'
                elif kind == 'enum':
                    data[key] = rule[2][0]
                elif kind == 'money':
                    data[key] = '80.1234' if key == 'recovered_amount' else '100.1234'
                elif kind == 'percent':
                    data[key] = '3.5'
                elif kind == 'rate':
                    data[key] = '0.30'
                elif kind == 'date':
                    data[key] = '2026-11-06'
                elif kind == 'url':
                    data[key] = 'https://example.com'
                elif kind == 'image':
                    data[key] = None
                elif kind == 'last_four':
                    data[key] = '0123'
                elif kind == 'day':
                    data[key] = 20
            row = client.call('create', {'module': module, 'data': data}, expected=201)['record']
            records.append(row)
            assert row['version'] == 1
            if module == 'temp_investments':
                assert row['computed']['net_profit'] == '-20.0000'
            assert client.call('get', id=row['id'])['record']['data'] == row['data']
            data['notes'] = '更新完成'
            changed = client.call('update', {'id': row['id'], 'version': 1, 'data': data})['record']
            records[-1] = changed
            assert changed['version'] == 2 and changed['data']['notes'] == '更新完成'
            client.call('update', {'id': row['id'], 'version': 1, 'data': data}, expected=409)
            client.call('delete', {'id': row['id'], 'version': 1}, expected=409)
        assert client.call('search', q=marker)['total'] == 8
        assert client.call('search', q="%' OR 1=1 --")['total'] == 0
        assert len(client.call('export')['modules']) == 8
        assert len(client.call('list', limit='2')['records']) == 2
        client.call('create', {'module': 'not_a_module', 'data': {}}, expected=400)
        invalid = dict(records[0]['data'], amount='-1')
        client.call('create', {'module': 'purchases', 'data': invalid}, expected=400)
        invalid = dict(records[0]['data'], purchase_date='2026-02-30')
        client.call('create', {'module': 'purchases', 'data': invalid}, expected=400)
        invalid = dict(records[0]['data'], receipt_url='javascript:alert(1)')
        client.call('create', {'module': 'purchases', 'data': invalid}, expected=400)
        client.call('upload', {'module': 'purchases', 'image': 'data:image/jpeg;base64,YWJj'}, expected=400)
        client.call('delete', {'id': records[0]['id'], 'version': 2}, csrf=False, expected=403)
        # Drop only the PHP session cookie; the database-backed 30-day login must survive.
        for cookie in list(client.jar):
            if cookie.name == 'hub_session':
                client.jar.clear(cookie.domain, cookie.path, cookie.name)
        assert client.call('session')['authenticated'] is True
        print('PASS: 8-module CRUD, Unicode search, export, settings, conflict, validation, CSRF, persistent login')
    finally:
        for row in records:
            current = client.call('get', id=row['id'])['record']
            client.call('delete', {'id': row['id'], 'version': current['version']})
            client.call('get', id=row['id'], expected=404)
        if original_settings is not None:
            restored = dict(original_settings['rates_to_sgd'])
            current = client.call('settings')
            client.call('settings_update', {
                'base_currency': original_settings['base_currency'],
                'rates_to_sgd': restored, 'version': current['version']
            })
        other = Client(base)
        # Simulate a second device holding the same valid bearer cookie.
        for cookie in client.jar:
            if cookie.name == 'hub_remember':
                other.jar.set_cookie(copy.copy(cookie))
        assert other.call('session')['authenticated'] is True
        client.call('logout', {'all_devices': True})
        other.call('list', expected=401)
        client.call('list', expected=401)
        print('PASS: record cleanup and immediate all-device logout')
        client.call('session')
        for _ in range(9):
            client.call('login', {'password': 'incorrect-' + uuid.uuid4().hex}, expected=401)
        client.call('login', {'password': password}, expected=429)
        print('PASS: invalid-password rejection and login throttling')


if __name__ == '__main__':
    main()
