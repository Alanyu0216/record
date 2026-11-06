<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
ini_set('display_errors', '0');

function reply(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}
function fail(string $message, int $status = 400): void
{
    reply(['ok' => false, 'error' => $message], $status);
}
function schemas(): array
{
    // type, required, maximum text length or allowed values
    $name = ['text', true, 200];
    $text = ['text', false, 500];
    $notes = ['text', false, 10000];
    $money = ['money', true];
    $optionalMoney = ['money', false];
    $currency = ['currency', true];
    $date = ['date', false];
    $image = ['image', false];
    return [
        'purchases' => [
            'name' => $name, 'category' => ['enum', true, ['数码','家居','服饰','其他']],
            'amount' => $money, 'currency' => $currency, 'purchase_date' => ['date', true],
            'merchant' => $text, 'payment_method' => $text, 'warranty_expiry' => $date,
            'receipt_url' => $image, 'notes' => $notes,
        ],
        'investments' => [
            'name' => $name, 'broker' => $text,
            'asset_class' => ['enum', true, ['股票','REITs','基金','黄金','定存','其他']],
            'principal' => $money, 'current_value' => $money, 'currency' => $currency,
            'buy_date' => ['date', true], 'status' => ['enum', true, ['持有中','已平仓']],
            'receipt_url' => $image, 'notes' => $notes,
        ],
        'temp_investments' => [
            'name' => $name, 'amount' => $money, 'currency' => $currency,
            'start_date' => ['date', true], 'expected_settlement_date' => $date,
            'actual_settlement_date' => $date,
            'status' => ['enum', true, ['进行中','已回本','已结清']],
            'recovered_amount' => $optionalMoney, 'receipt_url' => $image, 'notes' => $notes,
        ],
        'subscriptions' => [
            'name' => $name, 'url' => ['url', false], 'icon_url' => ['url', false],
            'amount' => $money, 'currency' => $currency,
            'billing_cycle' => ['enum', true, ['月付','季付','年付']],
            'next_billing_date' => ['date', true], 'card_name' => $text,
            'status' => ['enum', true, ['订阅中','已取消']], 'notes' => $notes,
        ],
        'savings' => [
            'name' => $name, 'deposit_type' => ['enum', true, ['活期','定期','高息账户','储蓄目标']],
            'balance' => $money, 'target_amount' => $optionalMoney, 'currency' => $currency,
            'annual_rate' => ['percent', false], 'last_updated_date' => ['date', true], 'notes' => $notes,
        ],
        'currencies' => [
            'currency' => $currency, 'holding_type' => ['enum', true, ['实体钞票现金','多币种卡内余额']],
            'amount' => $money, 'acquisition_rate' => ['rate', false],
            'reference_value' => $optionalMoney, 'reference_currency' => ['enum', false, ['SGD','MYR']],
            'location' => $name, 'notes' => $notes,
        ],
        'cards' => [
            'name' => $name, 'issuer' => $text,
            'card_type' => ['enum', true, ['Debit','Credit','多币种预付卡']],
            'last_four' => ['last_four', false], 'currency' => $currency,
            'benefits' => $notes, 'annual_fee_conditions' => $notes,
            'statement_day' => ['day', false], 'payment_due_day' => ['day', false],
            'status' => ['enum', true, ['使用中','闲置','已注销']], 'image_url' => $image, 'notes' => $notes,
        ],
        'passwords' => [
            'name' => $name, 'url' => ['url', false], 'username' => $text,
            'password_hint' => ['text', false, 1000], 'phone_2fa_memo' => $text,
            'reference_url' => $image, 'tags' => $text, 'notes' => $notes,
        ],
    ];
}
function currencyCodes(): array
{
    return ['SGD','MYR','JPY','VND','CNY','THB','USD','HKD','TWD','EUR','GBP','AUD','NZD','KRW','IDR','PHP','CHF','CAD'];
}
function validDecimal($value, int $scale, bool $positive = false): bool
{
    if (!is_string($value) && !is_int($value)) {
        return false;
    }
    return preg_match('/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,' . $scale . '})?$/D', (string) $value) === 1
        && (!$positive || (float) $value > 0);
}
function validateData(string $module, array $data): array
{
    $schema = schemas()[$module];
    if (array_diff(array_keys($data), array_keys($schema))) {
        fail('包含未知字段');
    }
    $result = [];
    foreach ($schema as $key => $rule) {
        $v = $data[$key] ?? null;
        if ($v === '' || $v === null) {
            if ($rule[1]) {
                fail('必填字段：' . $key);
            }
            $result[$key] = null;
            continue;
        }
        $ok = false;
        switch ($rule[0]) {
            case 'text':
                $ok = is_string($v) && mb_check_encoding($v, 'UTF-8') && mb_strlen($v) <= $rule[2]
                    && (!$rule[1] || trim($v) !== '');
                if ($ok) { $v = trim($v); }
                break;
            case 'currency':
                $ok = is_string($v) && in_array($v, currencyCodes(), true);
                break;
            case 'enum':
                $ok = in_array($v, $rule[2], true);
                break;
            case 'money':
            case 'percent':
            case 'rate':
                $ok = validDecimal($v, $rule[0] === 'money' ? 4 : 8, $rule[0] === 'rate');
                if ($rule[0] === 'percent') { $ok = $ok && (float) $v <= 100; }
                if ($ok) { $v = (string) $v; }
                break;
            case 'date':
                $d = is_string($v) ? DateTimeImmutable::createFromFormat('!Y-m-d', $v) : false;
                $ok = $d && $d->format('Y-m-d') === $v && $v >= '1000-01-01';
                break;
            case 'last_four':
                $ok = is_string($v) && preg_match('/^[0-9]{4}$/D', $v) === 1;
                break;
            case 'day':
                $ok = is_int($v) && $v >= 1 && $v <= 31;
                break;
            case 'url':
            case 'image':
                $ok = is_string($v) && strlen($v) <= 2048 && filter_var($v, FILTER_VALIDATE_URL)
                    && in_array(strtolower((string) parse_url($v, PHP_URL_SCHEME)), ['https','http'], true)
                    && parse_url($v, PHP_URL_USER) === null && parse_url($v, PHP_URL_PASS) === null;
                if ($rule[0] === 'image') {
                    $ok = $ok && parse_url($v, PHP_URL_SCHEME) === 'https'
                        && in_array(parse_url($v, PHP_URL_HOST), ['drive.google.com','lh3.googleusercontent.com'], true);
                }
                break;
        }
        if (!$ok) { fail('字段格式错误：' . $key); }
        $result[$key] = $v;
    }
    if ($module === 'currencies' && $result['reference_value'] !== null && $result['reference_currency'] === null) {
        fail('参考价值必须选择 SGD 或 MYR');
    }
    return $result;
}
function rowData(array $row): array
{
    $row['id'] = (string) $row['id'];
    $row['version'] = (int) $row['version'];
    $row['data'] = json_decode($row['data'], true, 32, JSON_THROW_ON_ERROR);
    // Derived values are not writable record fields. Decimal arithmetic avoids float rounding.
    if ($row['module_type'] === 'temp_investments') {
        $recovered = $row['data']['recovered_amount'];
        $row['computed'] = ['net_profit' => $recovered === null ? null : bcsub($recovered, $row['data']['amount'], 4)];
    }
    return $row;
}
function positiveId($value): string
{
    if ((!is_string($value) && !is_int($value)) || !preg_match('/^[1-9][0-9]{0,17}$/D', (string) $value)) {
        fail('无效记录 ID');
    }
    return (string) $value;
}
function getRecord(PDO $db, string $id): array
{
    $s = $db->prepare('SELECT * FROM records WHERE id = ?');
    $s->execute([$id]);
    $row = $s->fetch();
    if (!$row) { fail('记录不存在', 404); }
    return rowData($row);
}
function moduleName($value): string
{
    if (!is_string($value) || !isset(schemas()[$value])) { fail('无效模块'); }
    return $value;
}
function setAuthCookie(string $token, int $expires, array $config): void
{
    setcookie('hub_remember', $token, [
        'expires' => $expires, 'path' => '/', 'secure' => $config['cookie_secure'],
        'httponly' => true, 'samesite' => 'Strict',
    ]);
}
function consumeLoginAttempt(PDO $db, string $bucket): void
{
    // Atomic increment prevents concurrent requests from bypassing the limit.
    $s = $db->prepare('INSERT INTO login_limits (bucket, attempts, window_start) VALUES (?, 1, UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE attempts = IF(window_start < UTC_TIMESTAMP() - INTERVAL 15 MINUTE, 1, attempts + 1),
        window_start = IF(window_start < UTC_TIMESTAMP() - INTERVAL 15 MINUTE, UTC_TIMESTAMP(), window_start)');
    $s->execute([$bucket]);
    $s = $db->prepare('SELECT attempts FROM login_limits WHERE bucket = ?');
    $s->execute([$bucket]);
    if ((int) $s->fetchColumn() > 10) {
        header('Retry-After: 900');
        fail('尝试过于频繁，请在 15 分钟后重试', 429);
    }
}

try {
    $config = require __DIR__ . '/config.php';
    foreach (['pdo_mysql','mbstring','bcmath','curl','fileinfo'] as $ext) {
        if (!extension_loaded($ext)) { throw new RuntimeException('Missing extension: ' . $ext); }
    }
    if ($config['password_hash'] === '' || $config['db_name'] === '' || $config['db_user'] === '' || $config['origin'] === '') {
        fail('请先完成服务器私有配置', 503);
    }
    if (!in_array(parse_url($config['origin'], PHP_URL_SCHEME), ['https','http'], true)
        || ($config['cookie_secure'] && parse_url($config['origin'], PHP_URL_SCHEME) !== 'https')
        || (password_get_info($config['password_hash'])['algoName'] ?? 'unknown') === 'unknown') {
        throw new RuntimeException('Invalid origin or password hash configuration');
    }
    date_default_timezone_set('UTC');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string) $config['session_seconds']);
    session_name('hub_session');
    session_set_cookie_params([
        'lifetime' => $config['session_seconds'], 'path' => '/',
        'secure' => $config['cookie_secure'], 'httponly' => true, 'samesite' => 'Strict',
    ]);
    session_start();
    $db = new PDO(
        'mysql:host=' . $config['db_host'] . ';port=' . $config['db_port'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
        $config['db_user'], $config['db_password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false]
    );
    $db->exec("SET time_zone = '+00:00'");
    $fingerprint = hash('sha256', $config['password_hash']);
    $remember = $_COOKIE['hub_remember'] ?? '';
    $authenticated = false;
    if (is_string($remember) && preg_match('/^[a-f0-9]{64}$/D', $remember)) {
        $s = $db->prepare('SELECT token_hash FROM auth_tokens WHERE token_hash = ? AND password_fingerprint = ? AND expires_at > UTC_TIMESTAMP()');
        $s->execute([hash('sha256', $remember), $fingerprint]);
        $authenticated = (bool) $s->fetchColumn();
        if ($authenticated && empty($_SESSION['authenticated'])) { session_regenerate_id(true); }
    }
    $_SESSION['authenticated'] = $authenticated;
    if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(32)); }

    $action = $_GET['action'] ?? 'session';
    $methods = [
        'session' => 'GET', 'schema' => 'GET', 'list' => 'GET', 'get' => 'GET', 'search' => 'GET',
        'export' => 'GET', 'settings' => 'GET', 'login' => 'POST', 'logout' => 'POST',
        'create' => 'POST', 'update' => 'POST', 'delete' => 'POST', 'settings_update' => 'POST', 'upload' => 'POST',
    ];
    if (!is_string($action) || !isset($methods[$action])) { fail('接口不存在', 404); }
    if ($_SERVER['REQUEST_METHOD'] !== $methods[$action]) {
        header('Allow: ' . $methods[$action]);
        fail('请求方法不支持', 405);
    }
    $input = [];
    if ($methods[$action] === 'POST') {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '' && $origin !== $config['origin']) { fail('来源不允许', 403); }
        $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($csrf) || !hash_equals($_SESSION['csrf'], $csrf)) { fail('CSRF 校验失败，请刷新会话', 403); }
        if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) { fail('需要 application/json', 415); }
        $raw = file_get_contents('php://input', false, null, 0, 5 * 1024 * 1024 + 1);
        if ($raw === false || strlen($raw) > 5 * 1024 * 1024) { fail('请求过大', 413); }
        try {
            $parsed = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
            if (!$parsed instanceof stdClass) { fail('JSON 必须是对象'); }
            $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) { fail('无效 JSON'); }
    }
    if ($action === 'session') {
        reply(['ok' => true, 'authenticated' => $authenticated, 'csrf_token' => $_SESSION['csrf']]);
    }
    if ($action === 'login') {
        $password = $input['password'] ?? null;
        if (!is_string($password) || strlen($password) > 1024) { fail('无效密码'); }
        consumeLoginAttempt($db, hash('sha256', 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')));
        consumeLoginAttempt($db, hash('sha256', 'account:' . $fingerprint));
        if (!password_verify($password, $config['password_hash'])) { fail('密码错误', 401); }
        $db->exec('DELETE FROM auth_tokens WHERE expires_at <= UTC_TIMESTAMP()');
        $db->exec('DELETE FROM login_limits WHERE window_start < UTC_TIMESTAMP() - INTERVAL 1 DAY');
        if ($authenticated) {
            $s = $db->prepare('DELETE FROM auth_tokens WHERE token_hash = ?');
            $s->execute([hash('sha256', $remember)]);
        }
        $token = bin2hex(random_bytes(32));
        $expires = time() + $config['session_seconds'];
        $s = $db->prepare('INSERT INTO auth_tokens (token_hash, password_fingerprint, expires_at) VALUES (?, ?, ?)');
        $s->execute([hash('sha256', $token), $fingerprint, gmdate('Y-m-d H:i:s', $expires)]);
        session_regenerate_id(true);
        $_SESSION['authenticated'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        setAuthCookie($token, $expires, $config);
        reply(['ok' => true, 'authenticated' => true, 'csrf_token' => $_SESSION['csrf'], 'expires_at' => gmdate('c', $expires)]);
    }
    if (!$authenticated) { fail('请先解锁', 401); }
    if ($action === 'logout') {
        $s = $db->prepare(!empty($input['all_devices']) ? 'DELETE FROM auth_tokens' : 'DELETE FROM auth_tokens WHERE token_hash = ?');
        $s->execute(!empty($input['all_devices']) ? [] : [hash('sha256', $remember)]);
        setAuthCookie('', time() - 3600, $config);
        $_SESSION = [];
        session_destroy();
        reply(['ok' => true]);
    }
    if ($action === 'schema') {
        reply(['ok' => true, 'modules' => schemas(), 'currencies' => currencyCodes(), 'timezone' => 'Asia/Singapore']);
    }
    if ($action === 'get') { reply(['ok' => true, 'record' => getRecord($db, positiveId($_GET['id'] ?? null))]); }
    if (in_array($action, ['list','search','export'], true)) {
        $where = [];
        $args = [];
        if (isset($_GET['module'])) { $where[] = 'module_type = ?'; $args[] = moduleName($_GET['module']); }
        if ($action === 'search') {
            $q = $_GET['q'] ?? '';
            if (!is_string($q) || trim($q) === '' || mb_strlen($q) > 100) { fail('搜索词需要 1–100 字符'); }
            // Escape LIKE metacharacters. Search values, including Chinese, rather than JSON key names.
            $where[] = "JSON_SEARCH(data, 'one', ?, '!') IS NOT NULL";
            $args[] = '%' . strtr(trim($q), ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
        }
        $filter = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        if ($action === 'export') {
            $s = $db->prepare('SELECT * FROM records' . $filter . ' ORDER BY module_type, id');
            $s->execute($args);
            $grouped = array_fill_keys(array_keys(schemas()), []);
            while ($row = $s->fetch()) { $grouped[$row['module_type']][] = rowData($row); }
            reply(['ok' => true, 'modules' => $grouped, 'exported_at' => gmdate('c')]);
        }
        $limitRaw = $_GET['limit'] ?? '100';
        $offsetRaw = $_GET['offset'] ?? '0';
        if (!is_string($limitRaw) || !ctype_digit($limitRaw) || !is_string($offsetRaw) || !ctype_digit($offsetRaw)
            || (int) $limitRaw < 1 || (int) $limitRaw > 500 || (float) $offsetRaw > 100000000) { fail('分页参数无效'); }
        $limit = (int) $limitRaw;
        $offset = (int) $offsetRaw;
        $s = $db->prepare('SELECT COUNT(*) FROM records' . $filter);
        $s->execute($args);
        $total = (int) $s->fetchColumn();
        $s = $db->prepare('SELECT * FROM records' . $filter . ' ORDER BY updated_at DESC, id DESC LIMIT ' . $limit . ' OFFSET ' . $offset);
        $s->execute($args);
        reply(['ok' => true, 'records' => array_map('rowData', $s->fetchAll()), 'total' => $total, 'limit' => $limit, 'offset' => $offset]);
    }
    if (in_array($action, ['create','update','delete'], true)) {
        if ($action === 'create') {
            $module = moduleName($input['module'] ?? null);
        } else {
            $id = positiveId($input['id'] ?? null);
            $existing = getRecord($db, $id);
            $module = $existing['module_type'];
            if (!isset($input['version']) || !is_int($input['version']) || $input['version'] < 1) { fail('必须提供记录 version'); }
        }
        if ($action !== 'delete') {
            if (!isset($input['data']) || !is_array($input['data'])) { fail('必须提供 data 对象'); }
            $data = validateData($module, $input['data']);
            $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        }
        if ($action === 'create') {
            $s = $db->prepare('INSERT INTO records (module_type, data) VALUES (?, ?)');
            $s->execute([$module, $json]);
            reply(['ok' => true, 'record' => getRecord($db, $db->lastInsertId())], 201);
        }
        if ($action === 'update') {
            $s = $db->prepare('UPDATE records SET data = ?, version = version + 1, updated_at = UTC_TIMESTAMP() WHERE id = ? AND version = ?');
            $s->execute([$json, $id, $input['version']]);
        } else {
            $s = $db->prepare('DELETE FROM records WHERE id = ? AND version = ?');
            $s->execute([$id, $input['version']]);
        }
        if ($s->rowCount() !== 1) { fail('记录已在另一设备修改或删除，请刷新后重试', 409); }
        reply($action === 'delete' ? ['ok' => true] : ['ok' => true, 'record' => getRecord($db, $id)]);
    }
    if ($action === 'settings' || $action === 'settings_update') {
        if ($action === 'settings_update') {
            $base = $input['base_currency'] ?? '';
            $rates = $input['rates_to_sgd'] ?? null;
            if (!in_array($base, ['SGD','MYR'], true) || !is_array($rates) || count($rates) > count(currencyCodes())) { fail('汇率设置无效'); }
            foreach ($rates as $code => $rate) {
                if (!in_array($code, currencyCodes(), true) || !validDecimal($rate, 8, true)) { fail('无效汇率：' . $code); }
                $rates[$code] = (string) $rate;
            }
            if (!isset($rates['SGD']) || bccomp($rates['SGD'], '1', 8) !== 0 || ($base === 'MYR' && !isset($rates['MYR']))) { fail('SGD 汇率必须为 1；切换 MYR 时必须设置 MYR 汇率'); }
            if (!isset($input['version']) || !is_int($input['version']) || $input['version'] < 1) { fail('必须提供设置 version'); }
            $s = $db->prepare("UPDATE app_settings SET value_json = ?, version = version + 1, updated_at = UTC_TIMESTAMP() WHERE setting_key = 'preferences' AND version = ?");
            $s->execute([json_encode(['base_currency' => $base, 'rates_to_sgd' => $rates], JSON_THROW_ON_ERROR), $input['version']]);
            if ($s->rowCount() !== 1) { fail('汇率已在另一设备修改，请刷新', 409); }
        }
        $setting = $db->query("SELECT value_json, version, updated_at FROM app_settings WHERE setting_key = 'preferences'")->fetch();
        if (!$setting) { throw new RuntimeException('Missing preferences; import database.sql'); }
        reply(['ok' => true, 'settings' => json_decode($setting['value_json'], true, 32, JSON_THROW_ON_ERROR),
            'version' => (int) $setting['version'], 'updated_at' => $setting['updated_at']]);
    }
    if ($action === 'upload') {
        $module = moduleName($input['module'] ?? null);
        $image = $input['image'] ?? null;
        if (!is_string($image) || !preg_match('#^data:image/(jpeg|webp);base64,([A-Za-z0-9+/=]+)$#D', $image, $parts)) { fail('仅接受压缩后的 JPEG/WebP Base64'); }
        $bytes = base64_decode($parts[2], true);
        if ($bytes === false || strlen($bytes) > $config['max_image_bytes']) { fail('图片最大 3MB', 413); }
        $size = @getimagesizefromstring($bytes);
        if (!$size || $size[0] > 1200 || $size[1] > 12000 || !in_array($size['mime'], ['image/jpeg','image/webp'], true)
            || $size['mime'] !== 'image/' . $parts[1]) { fail('无效图片或尺寸超限（最大宽 1200px、高 12000px）'); }
        if ($config['drive_token'] === '' || $config['drive_url'] === '') { fail('尚未配置 Google Drive 上传', 503); }
        if (!preg_match('#^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$#D', $config['drive_url'])) {
            throw new RuntimeException('Invalid Drive Web App URL');
        }
        // Follow only the ContentService result redirect, and never repost the secret to a redirect target.
        $curl = curl_init($config['drive_url']);
        curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 45, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_POSTFIELDS => json_encode(['token' => $config['drive_token'], 'module' => $module, 'image' => $image], JSON_THROW_ON_ERROR)]);
        $response = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $redirect = curl_getinfo($curl, CURLINFO_REDIRECT_URL);
        curl_close($curl);
        if ($status === 302 || $status === 303) {
            if (!is_string($redirect) || parse_url($redirect, PHP_URL_SCHEME) !== 'https' || parse_url($redirect, PHP_URL_HOST) !== 'script.googleusercontent.com') {
                fail('Drive 返回不受信任的跳转', 502);
            }
            $curl = curl_init($redirect);
            curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 45, CURLOPT_FOLLOWLOCATION => false]);
            $response = curl_exec($curl);
            $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
            curl_close($curl);
        }
        $result = is_string($response) ? json_decode($response, true) : null;
        if ($status !== 200 || !is_array($result) || ($result['ok'] ?? false) !== true) { fail('Drive 上传失败，请检查脚本部署、令牌和授权', 502); }
        if (!isset($result['file_id']) || !is_string($result['file_id']) || !preg_match('/^[A-Za-z0-9_-]{10,200}$/D', $result['file_id'])) {
            fail('Drive 返回无效文件信息', 502);
        }
        $fileId = $result['file_id'];
        reply(['ok' => true, 'file_id' => $fileId,
            'view_url' => 'https://drive.google.com/file/d/' . $fileId . '/view',
            'image_url' => 'https://drive.google.com/uc?export=view&id=' . $fileId,
            'public' => ($result['public'] ?? false) === true], 201);
    }
    fail('接口不存在', 404);
} catch (Throwable $e) {
    // Do not expose DSNs, credentials, tokens, payloads or PHP stack traces.
    error_log('Life Hub API failure: ' . get_class($e) . ' code=' . $e->getCode());
    fail('服务器暂时无法完成请求，请检查服务器日志和配置', 500);
}
