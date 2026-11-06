# Personal Life & Finance Hub · 第一至第三阶段

个人专属的跨设备财务与信息记录网站：HTML5、Tailwind CSS CDN、Vanilla JavaScript、Lucide、SheetJS、PHP 8、MySQL。八个模块使用统一 JSON 记录表；所有金额以十进制字符串传输，前端用 BigInt 定点运算处理金额、汇率和合计。已提供完整响应式界面、密码门禁、即时全局搜索、SGD/MYR 看板、手动汇率、图片压缩上传、八工作表 Excel 导出与基础 PWA。

第三阶段的 GitHub 安全上传、临时域名创建、Git / File Manager 部署、MySQL 导入及上线验收，请按 [DEPLOYMENT.md](DEPLOYMENT.md) 操作。新增的 `config.example.php` 是私有配置模板；服务器上的 `config.php` 继续使用无密钥加载器，不要用模板覆盖它。`.htaccess` 已包含强制 HTTPS，因此先确认临时域名 SSL 可用。

## Hostinger 部署

1. 在 hPanel 创建 MySQL 数据库与数据库用户。选择 PHP 8.0 或更新版本，启用 `pdo_mysql`、`mbstring`、`bcmath`、`curl`、`fileinfo`。本项目无需 Composer 或 Node。
2. 在 phpMyAdmin 选择该数据库，再导入 `database.sql`；重复导入不会清空已有数据。
3. 将 `index.html`、`app.js`、`api.php`、`config.php`、`.htaccess`、`manifest.webmanifest`、`sw.js`、`icon.svg`、`icon-192.png`、`icon-512.png` 一起上传至临时域名的 `public_html`。也支持将这些文件放在同一个子目录。源码仓库中的 SQL、文档、测试和 Apps Script 无需上传。
4. 将 `hub-private.example.php` 复制为 `public_html` **上一级**的 `hub-private.php`，填写真实配置。不要把这个文件放进 GitHub。可以使用 Hostinger 环境变量替代；环境变量优先。共享主机若有 `open_basedir` 限制，确保该上级目录在允许范围内。
5. 生成登录密码哈希：在可信的 PHP 环境执行下列命令，通过终端标准输入输入密码，完成后按 Ctrl+D。输入不是隐藏模式，请在私人终端操作。复制输出哈希到 `HUB_PASSWORD_HASH`，不要保存明文密码：

   ```sh
   php -r '$p = rtrim(stream_get_contents(STDIN), "\r\n"); if (strlen($p) < 12) {fwrite(STDERR, "Use at least 12 characters\n"); exit(1);} echo password_hash($p, PASSWORD_DEFAULT), PHP_EOL;'
   ```

6. `HUB_ORIGIN` 填网站实际来源，例如 `https://your-name.hostingersite.com`，不带路径或末尾斜杠。启用域名 SSL 和 HTTPS 跳转；生产环境保持 `HUB_COOKIE_SECURE=1`。本地 HTTP 测试才设置为 `0`。
7. 配置下文的 Apps Script，再填写 `HUB_DRIVE_URL` 与 `HUB_DRIVE_TOKEN`。未配置 Drive 时其他接口仍可使用，上传返回 503。
8. 请求 `GET /api.php?action=session`，应返回 `ok:true`、`authenticated:false` 和 CSRF 令牌；随后按下文测试登录和 CRUD。

生产服务器关闭 `display_errors`，保留受保护的 PHP 错误日志。服务器时间与数据库时间统一 UTC；业务日期字段是 `YYYY-MM-DD`，界面使用 Asia/Singapore 判断订阅提醒。数据只存数据库，不依赖设备 localStorage。设备间每 30 秒拉取同步，回到前台或窗口重新聚焦时也同步，可点击“立即同步”；不提供 WebSocket 推送。

## API 协议

全部接口在 `api.php?action=...`；JSON 响应。只有 `session` 与 `login` 不要求登录。所有 POST（包括登录）要求：

- 先 GET `session`，保留服务器 Cookie。
- `Content-Type: application/json`。
- `X-CSRF-Token: session 返回的 csrf_token`。
- 同源调用，浏览器 `fetch` 使用 `credentials:'same-origin'`。不开放跨域 CORS。

登录成功会更换 Session ID 和 CSRF，请使用新令牌。30 天免登 Cookie 是随机令牌，数据库只保存 SHA-256 哈希；过期后必须重新登录，服务器清理 Session 文件不会使有效免登令牌丢失。改动 `HUB_PASSWORD_HASH` 会使所有设备令牌失效。数据库 Session 令牌在每次请求验证，因此“退出所有设备”立即生效。

| action | 方法 | 参数或 JSON 请求体 | 返回内容 |
| --- | --- | --- | --- |
| session | GET | 无 | authenticated、csrf_token |
| login | POST | `{"password":"输入的解锁密码"}` | authenticated、新 csrf_token、expires_at |
| logout | POST | `{}`；或 `{"all_devices":true}` | ok |
| schema | GET | 无 | 全模块字段规则、币种、业务时区 |
| create | POST | `{"module":"purchases","data":{...}}` | 新 record，HTTP 201 |
| list | GET | 可选 module、limit=100（1–500）、offset=0 | records、total、limit、offset |
| get | GET | id | 单条 record |
| update | POST | `{"id":"1","version":1,"data":{...}}` | 更新后的 record |
| delete | POST | `{"id":"1","version":2}` | ok |
| search | GET | q（1–100 字），可选 module、limit、offset | 跨模块搜索结果与分页 |
| export | GET | 无，或可选 module | modules：八个模块各一个数组，包括空模块 |
| settings | GET | 无 | settings、version、updated_at |
| settings_update | POST | base_currency、rates_to_sgd、version | 最新设置 |
| upload | POST | module、image（压缩图片 Data URL） | file_id、view_url、image_url、public |

`update` 为完整替换 data，必填字段必须齐全，未填写的可选字段归一为 null。模块类型不能修改。record 包含字符串 `id`、`module_type`、`data`、整数 `version`、`created_at`、`updated_at`；短期投资另有只读 `computed.net_profit`。

版本不一致返回 409，客户端应重新拉取并让用户决定如何合并，不能盲目覆盖。其他状态：400 输入错误，401 未登录或密码错误，403 CSRF/来源错误，404 不存在，405 方法错误，413 过大，415 格式错误，429 登录限速，500 服务故障，502 Drive 故障，503 未配置。错误结构为 `{"ok":false,"error":"说明"}`。登录按来源 IP 和整个账号双重限制，每 15 分钟最多 10 次尝试；不使用不可信的 X-Forwarded-For。

### 字段约定

`schema` 返回格式为 `[类型, 是否必填, 可选的文本长度上限或枚举选项]`，可直接作为第二阶段表单定义。枚举使用下表中的中文原值；卡类型使用指定英文值。金额使用非负十进制字符串，最多 12 位整数、4 位小数；汇率最多 8 位小数且大于零。ID 必须作为字符串处理。URL 只允许 HTTP/HTTPS；图片链接限 Google Drive/Google 图片域名 HTTPS。

| 模块 | 必填字段 | 可选字段 |
| --- | --- | --- |
| purchases | name, category, amount, currency, purchase_date | merchant, payment_method, warranty_expiry, receipt_url, notes |
| investments | name, asset_class, principal, current_value, currency, buy_date, status | broker, receipt_url, notes |
| temp_investments | name, amount, currency, start_date, status | expected_settlement_date, actual_settlement_date, recovered_amount, receipt_url, notes |
| subscriptions | name, amount, currency, billing_cycle, next_billing_date, status | url, icon_url, card_name, notes |
| savings | name, deposit_type, balance, currency, last_updated_date | target_amount, annual_rate, notes |
| currencies | currency, holding_type, amount, location | acquisition_rate, reference_value, reference_currency, notes |
| cards | name, card_type, currency, status | issuer, last_four, benefits, annual_fee_conditions, statement_day, payment_due_day, image_url, notes |
| passwords | name | url, username, password_hint, phone_2fa_memo, reference_url, tags, notes |

卡号 `last_four` 必须是四位字符串，可保留前导零；账单日与还款日是 1–31 的整数。银行按月末处理不存在的日期，前端提醒也需采用月末规则。年化利率范围 0–100。密码备忘界面必须标注“仅填提示语”，不要输入真实密码、恢复码或 2FA 密钥。此模块不是密码保险库，数据没有应用层加密。

短期投资 `net_profit = recovered_amount - amount`，保留四位小数；未输入回款时为 null，允许负收益。进行中的净收益只代表已收回金额减投入，不是未实现估值。

### 创建示例

```json
{
  "module": "purchases",
  "data": {
    "name": "旅行耳机",
    "category": "数码",
    "amount": "129.90",
    "currency": "SGD",
    "purchase_date": "2026-11-06",
    "merchant": "本地商店",
    "payment_method": "Wise",
    "warranty_expiry": "2027-11-06",
    "receipt_url": null,
    "notes": "旅行使用"
  }
}
```

### 汇率与导出

`rates_to_sgd` 表示 **1 单位原币 = 多少 SGD**，折算目标币金额公式：`原金额 × rates_to_sgd[原币] ÷ rates_to_sgd[目标币]`。初始只有 SGD=1，其他币种需手动设置；缺失汇率时界面必须显示“未设置汇率”，不能当作零加入看板。

```json
{
  "base_currency": "MYR",
  "rates_to_sgd": { "SGD": "1", "MYR": "0.30", "USD": "1.30" },
  "version": 1
}
```

上例数值只示范格式，不是当前市场报价。保存时传完整汇率字典，必须包含 SGD=1，切换 MYR 时也必须包含 MYR。设置保存在 MySQL，可跨设备获取。投资盈亏、储蓄进度、订阅七天提醒和看板在前端根据这些原始数据计算。SheetJS 用 `export.modules` 生成八个工作表，即使模块没有记录也保留表头；所有用户字段（包括原币金额、带前导零的卡号后四位）显式导出为字符串，避免精度损失及公式注入。导出接口不包含登录令牌、数据库凭据或上传密钥。

## Google Apps Script

1. 在个人 Google Drive 新建一个**私有**根文件夹，复制其 URL 中的文件夹 ID。不要使用已公开或组织共享的根目录。
2. 新建 Apps Script 项目，粘贴完整 `DriveUploader.gs`。
3. 在“项目设置 → 脚本属性”添加 `ROOT_FOLDER_ID`、`UPLOAD_TOKEN`（自行生成至少 32 字符随机字符串），以及可选 `PUBLIC_IMAGES`。
4. `PUBLIC_IMAGES` 默认不填或 `false`：图片保持私有，查看链接需要登录拥有权限的 Google 账号；网页 `<img>` 不能保证直接显示。若需要跨设备网页直接显示，设为 `true`，上传的图片将设置为“知道链接的任何人可查看”。不要对敏感账号截图开启此选项。Google Workspace 管理策略可能禁止公开分享；脚本会返回失败并回收本次文件。
5. “部署 → 新部署 → Web 应用”：以自己身份执行，访问权限为“任何人”，完成 Drive 授权。上传密钥仍由脚本校验。将 `/exec` 部署 URL 填入 `HUB_DRIVE_URL`，相同令牌填入服务器私有配置的 `HUB_DRIVE_TOKEN`。修改代码后通过管理部署发布新版本。
6. 浏览器使用 Canvas 将图片最大宽度限制到 1200px、高度限制到 12000px，不放大原图，以 JPEG 质量 0.7 编码（PNG 透明区域转为白底），然后请求同源 PHP `upload`。支持 JPEG、PNG、WebP 原图，拒绝超过 25MB 或 6000 万像素的原图；HEIC 需先转换。服务器验证真实图片、宽高和大小，再转发给 Apps Script；因此不依赖 Apps Script 的浏览器 CORS 支持。限制压缩后 3MB，JSON 请求不超过 5MB。PHP `post_max_size` 建议至少 `8M`。
7. 上传响应中的 `image_url` 写入对应模块图片字段后，再调用 create/update；上传不会自动新建记录。`view_url` 用于新标签页打开 Drive。Google 的图片直链可能受登录、重定向和限流影响，前端应保留“在 Drive 查看”的备用入口。

脚本会自动创建 Purchases、Investments、TempInvestments、Subscriptions、Savings、Currencies、Cards、Passwords 文件夹。文件名由服务端生成。删除数据库记录不会删除 Drive 文件，避免误删；上传后放弃保存或网络超时也可能留下孤立文件，需要手动整理。根目录不要继承其他人的共享权限。

## 验证

后端测试脚本为 `tests/smoke.py`，使用 Python 3 标准库。只在独立测试数据库运行，它会创建八个模块的测试记录、修改设置并测试全设备登出；正常结束时恢复设置并删除测试记录。将网站地址设置为 `HUB_TEST_URL`，运行 `python3 tests/smoke.py`，在交互提示中输入测试登录密码。不要对正在使用的生产账号运行。

## 前端使用

- 首次访问显示密码门禁；验证会话前不请求财务数据。退出时清空内存记录、表单与搜索结果。共享设备不要使用 30 天免登；可从后端 `logout` 接口执行全设备退出。
- 桌面左侧导航包含总览及八个模块；平板和手机使用底部悬浮导航，“全部”打开完整模块导航。新增记录可以在弹窗中切换模块，查看 / 编辑弹窗包含该模块全部字段。
- 深色模式默认背景 `#0f172a`、卡片 `#1e293b`；切换主题写入 `localStorage` 的 `hub-theme`，不保存财务记录。搜索快捷键为 Ctrl+K / Cmd+K，输入即在全量内存记录中匹配；结果支持方向键、回车和 Escape。
- 前端通过 `schema` 接口生成表单，`app.js` 中显式定义八个模块的所有中文字段名称，与第一阶段字段严格对应。金额保留原币，非本位币额外显示参考折算金额。缺少汇率时显示提示，不按零隐式计入总览；合计会标为“部分合计”。
- 总览分别展示累计购买、持有中长期投资市值、储蓄余额和月均订阅预算；这些栏目不是净资产，账户间可能有重复记录。临时投资以实际回款减投入显示收益；订阅中且距扣款少于七天会高亮，已过期的扣款日期提醒更新。
- 图片上传完成后显示本地压缩缩略图并自动写入 Drive 链接；点击保存记录才写入数据库。再次打开私有图片可能无法嵌入，提供“在 Drive 查看”入口。上传 / 保存期间不能关闭表单；未保存编辑关闭前会提示。
- 多设备编辑冲突保留当前输入，不静默覆盖；可明确选择放弃编辑并载入服务器最新版本。网络超时可能发生“服务器成功、浏览器未收到响应”，应先同步确认再重试新增操作。
- 前端依赖固定版本 CDN：Tailwind Browser 4.1.18 与 Lucide 0.468.0 使用 `cdn.jsdelivr.net`；SheetJS 0.20.3 使用官方 `cdn.sheetjs.com`。浏览器需能访问它们。导出组件加载失败时显示明确提示；应用的关键布局 CSS 内嵌在 HTML 内。

## 添加到主屏幕（基础 PWA）

通过 HTTPS 打开网站。Android / Chromium 可使用浏览器“安装应用”，iOS Safari 使用“分享 → 添加到主屏幕”。`manifest.webmanifest`、192/512 像素图标和 `sw.js` 已提供。Service Worker 只缓存公开的 HTML、JavaScript、图标和 manifest，不缓存 API 响应、财务数据、Drive 图片或外部 CDN 脚本。离线可以打开外壳，但需要联网验证会话后才能查看记录；不支持离线编辑。升级发布时递增 `sw.js` 中的缓存版本号，新版本通常会在旧页面关闭后激活。

浏览器端测试：在安装了 Playwright 和 Chromium 的开发环境中，对**独立临时测试数据库**运行 `HUB_TEST_URL=... HUB_TEST_PASSWORD=... node tests/frontend.cjs`；这里的密码仅使用临时测试账号，通过进程环境传入。测试会创建、修改和删除数据，不要在生产账号运行。若依赖 CDN 在测试网络不可达，可用 `HUB_TEST_ASSETS` 指向预先下载的 `tailwind.js`、`lucide.js`、`xlsx.js`，仅在浏览器测试中拦截资源请求；生产页面始终使用声明的 CDN。

开发验证已在 PHP 8.4.24 + MariaDB 11.8.6 的临时数据库完成：八模块 CRUD、中文跨模块搜索、导出分组、汇率持久化、版本冲突、非法输入、CSRF、免登恢复和全设备退出。`node tests/drive_uploader.test.cjs` 验证 Apps Script 的鉴权、目录复用和共享设置流程（使用模拟 Drive）。真实 Google Drive 上传及 Hostinger 环境尚未部署验证，需要上述实际账号配置。

第二阶段通过 Chromium 桌面、390px 手机与 820px 平板浏览器验证：真实 PHP 登录、八模块完整字段与保存、编辑删除、即时全局搜索、汇率与主币种切换、版本冲突保留输入、图片 Canvas 压缩（2400×3200 → 1200×1600 JPEG）、上传请求与自动回填、实际下载并读取八 Sheet `.xlsx`、浅色主题持久化、PWA 缓存隔离和退出清空。Drive 上传返回在浏览器测试中模拟；外部依赖从固定版本测试资产加载，其中 SheetJS 使用 npm `@e965/xlsx` 的 0.20.3 镜像构建。未宣称官方 CDN 可达性或真实 Drive 授权已经验证。
