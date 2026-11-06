# 第三阶段：GitHub 与 Hostinger Business 部署

本项目是无构建步骤的 PHP 网站，使用 Hostinger Business **Web Hosting 的 PHP/自定义网站**，无需 Node.js 应用、WordPress 或 Composer。以下是可重复使用的人工操作清单；具体发布进度以 GitHub 提交及目标站点的实际核验结果为准。hPanel 菜单可能因界面版本和语言略有不同。

## 1. 文件与密钥布局

推荐把应用放在该网站的 `public_html` 根目录：

```text
网站目录/
├── hub-private.php             真实配置，仅在服务器创建，绝不上传 GitHub
└── public_html/
    ├── .htaccess
    ├── index.html
    ├── app.js
    ├── api.php
    ├── config.php              无密钥加载器，需要随代码部署
    ├── manifest.webmanifest
    ├── sw.js
    ├── icon.svg
    ├── icon-192.png
    └── icon-512.png
```

`config.example.php` 是新配置模板，与旧的 `hub-private.example.php` 用途相同。**把模板复制到服务器的 `public_html` 上一级并命名为 `hub-private.php`，不要用模板替换 `config.php`。** 真实配置最好通过 Hostinger File Manager 在服务器填写，而不是先放进本地仓库。

`config.php` 中的 `dirname(__DIR__) . '/hub-private.php'` 只往上找一级；因此以上说明以根目录部署为准。如果部署到 `public_html/hub/`，它将查找 `public_html/hub-private.php`，该位置已经在网站根目录内，不符合推荐的密钥隔离方案。要部署到子目录，先使用服务器支持的环境变量注入 `HUB_*` 配置，或另行调整加载器以读取实际文档根目录以外的私有路径，再验证 `open_basedir` 权限。不要直接把真实配置留在 `public_html` 内。

### 配置项

| 配置键 | 如何填写 |
| --- | --- |
| HUB_DB_HOST | 同一 Hostinger 主机上的 PHP 使用 `localhost` |
| HUB_DB_PORT | `3306`，除非主机另有说明 |
| HUB_DB_NAME / HUB_DB_USER | hPanel 显示的完整名称，含 `u..._` 之类前缀 |
| HUB_DB_PASSWORD | 新建数据库用户时设置的密码，只放真实私有配置 |
| HUB_PASSWORD_HASH | PHP `password_hash()` 的输出，不能填写明文登录密码 |
| HUB_ORIGIN | 实际 HTTPS 来源，如 `https://example.hostingersite.com`，不含路径和末尾斜杠 |
| HUB_COOKIE_SECURE | 生产环境保持字符串 `1` |
| HUB_DRIVE_URL | 已部署 Apps Script 的 `/exec` URL；可暂留空 |
| HUB_DRIVE_TOKEN | 与 Apps Script 脚本属性一致的令牌；只在服务器填写，可暂留空 |

解锁密码不会写进数据库或前端；服务器保存其哈希，并通过 `password_verify()` 验证。哈希本身也要保密。PHP 读取已有环境变量时会优先使用它们；项目没有自动加载 `.env` 文件。不要误用 hPanel 的 Node.js 环境变量页面配置这个 PHP 网站。

## 2. 安全上传 GitHub

### 2.1 创建或使用仓库

1. 可以使用现有 `Alanyu0216/record`；若新建仓库，建议设为 Private。私有仓库仍然不能提交密钥。
2. 保留原有仓库和本地改动，使用现有检出；无需新建 worktree 或重新初始化 Git。
3. 只修改服务器上的 `hub-private.php`，不要在 `config.php`、`config.example.php` 或旧示例里填写真实值。

### 2.2 检查忽略规则

`.gitignore` 已忽略真实私有配置、`.env`、证书私钥、数据库备份、上传目录、Session、日志、压缩备份和开发缓存；保留 `database.sql` 建表脚本以及空配置模板。`config.php` 必须提交，因为它仅是无密钥加载器。

在本地仓库运行：

```sh
git status --short
git check-ignore --no-index hub-private.php .env backup.sql backups/site.zip
git ls-files -- hub-private.php .env config.local.php config.production.php config.secret.php
git diff --check
```

第二条应输出列出的被忽略路径（这些文件不需要实际存在）；第三条对这些真实配置文件应当没有输出。`git ls-files` 也需要结合 `git status` 人工检查是否有其他命名的密钥或数据备份。**忽略规则不能移除已经被 Git 跟踪或提交的文件。**

如果真实私有文件已经被跟踪，先在仓库之外妥善保留本地副本，再用下列命令仅解除跟踪（只对确实存在于索引的文件执行）：

```sh
git rm --cached -- hub-private.php
```

如果密钥曾经提交过，后续删除不会清除历史；先更换数据库密码、网站密码及可能泄露的 Drive 令牌，再处理 Git 历史。不要依赖把仓库改成 Private 来撤回已经泄露的凭据。

### 2.3 显式加入项目文件并推送

不要直接使用 `git add .`。下面的名单不包含真实配置或数据库导出：

```sh
git add -- .gitignore .htaccess config.example.php config.php hub-private.example.php api.php database.sql DriveUploader.gs index.html app.js manifest.webmanifest sw.js icon.svg icon-192.png icon-512.png README.md DEPLOYMENT.md tests
git diff --cached --check
git diff --cached --stat
```

在自己可信的本地编辑器里检查暂存内容，确认示例中的敏感项为空，且没有数据备份或密钥，然后：

```sh
git commit -m "Build personal life and finance hub with deployment configuration"
git push origin main
```

这些命令也可用于后续更新；执行前先核对当前分支和待提交文件。若使用 GitHub 网页上传，同样只上传上述项目文件，确认隐藏的 `.gitignore` 和 `.htaccess` 也在仓库中。

## 3. 在 Business Web Hosting 创建 PHP 网站与临时域名

1. 登录 [hPanel](https://hpanel.hostinger.com/)，进入 **Websites / 网站**，确认选中你已有的 Business Web Hosting 套餐。
2. 点击 **Add website / 添加网站**，选择 **Custom PHP/HTML website / PHP/HTML 自定义网站** 或 **Empty website / 空白网站**，界面名称以当前 hPanel 为准。不要选 Hostinger Website Builder 或 Node.js 网站类型。
3. 域名步骤选择 **Use a temporary domain / 使用临时域名**。Hostinger 会分配一个 `*.hostingersite.com` 地址，等待网站初始化完成。
4. 记录实际分配的域名；示例域名不是你的真实地址。若页面没有临时域名选项，检查该网站是否仍在创建中或是否选成了建站工具网站，使用 hPanel 为 PHP/HTML 网站提供的临时域名入口，不要自行拼接一个 `hostingersite.com` 子域名。
5. 临时域名由 Hostinger 关联到新网站，**不需要在个人 DNS 中另加 A/CNAME，不需要购买域名或修改 nameserver**。
6. 进入该网站 **Dashboard / 管理**，核对 File Manager 指向的网站目录与记录的域名一致。若网站已有内容，先下载文件和数据库备份；不要覆盖不相关站点。
7. 在 **Advanced → PHP Configuration / PHP 配置** 选择 PHP 8.2 或更新的受支持版本，启用 `pdo_mysql`、`mbstring`、`bcmath`、`curl`、`fileinfo`。设置 `post_max_size` 至少 `8M`，建议 `memory_limit` 至少 `128M`；关闭 `display_errors`，保留服务器错误日志。
8. 在 **Security → SSL** 检查证书，等待临时域名 HTTPS 访问无证书错误，再部署本项目的强制 HTTPS 规则。如果 hPanel 显示自动 SSL，仍需打开实际 HTTPS 地址验证。使用 File Manager 可在重定向规则有误时修复，不必通过网站页面操作。

临时域名适合本次部署与测试。将来切换自有域名时再连接真实域名、配置 SSL，并更新 `HUB_ORIGIN`；本阶段不需要进行该操作。

## 4. 新建 MySQL 并导入表结构（两种部署方式共用）

1. 进入正确网站的 **Databases → Management / MySQL 数据库**。
2. 新建数据库和数据库用户，设置独立强密码，将用户关联到这个专用数据库并赋予应用所需权限。记下完整数据库名、用户名；不要复用其他网站的数据库或全局管理员账号。
3. 打开该库的 **phpMyAdmin**，先明确选中刚创建的数据库，再点击 **Import / 导入**，选择仓库中的 `database.sql`，格式 SQL，执行。
4. 确认出现四张表：`records`、`app_settings`、`auth_tokens`、`login_limits`。`app_settings` 中应有 `preferences`，初始汇率只包含 SGD=1。
5. 将完整连接信息填写到服务器上 `public_html` 上一级的 `hub-private.php`，数据库主机填写 `localhost`，不要填写供外部远程连接使用的 `srv....hstgr.io`。

普通重新部署代码不会清空数据库，也不需要再次创建库。`database.sql` 可以重复导入而不删表，但它不是未来所有版本的迁移工具；正式数据更新前先备份，后续结构变更使用对应版本的迁移说明。

## 5. 生成网站解锁密码哈希

在自己可信的 PHP 环境或 Hostinger SSH 终端，先执行：

```sh
php -r '$p = rtrim(stream_get_contents(STDIN), "\r\n"); if (strlen($p) < 12) {fwrite(STDERR, "Use at least 12 characters\n"); exit(1);} echo password_hash($p, PASSWORD_DEFAULT), PHP_EOL;'
```

执行后输入你自己选择的长密码，再按 Ctrl+D。输入不是隐藏模式，请在私人终端操作；密码没有作为 shell 命令参数出现。将生成的完整哈希仅粘贴到真实 `hub-private.php` 的 `HUB_PASSWORD_HASH`。不要使用第三方在线哈希网站，不要创建公开的 `hash.php` 页面。

如果 Hostinger 终端没有进入输入状态，在自己安装了 PHP 的电脑完成同样步骤即可。没有终端时优先使用本地可信 PHP 环境，不要在网站公开目录临时编写密码生成器。

## 6. 方式 A：hPanel Git 部署

适合后续持续从 GitHub 发布。

1. 确认前述项目文件已提交到 GitHub 的 `main` 分支。Git 部署只读取已提交并推送的文件，不包括本地未提交改动。
2. 进入目标网站 **Advanced → Git / 高级 → Git**。若当前 hPanel 提供 GitHub 连接，授权 Hostinger 访问指定仓库即可，尽量仅授权 `Alanyu0216/record`。
3. 如果界面采用旧的 Repository URL 表单，公开仓库可填 HTTPS URL；私有仓库按 hPanel 的 SSH 密钥流程，把 **Hostinger 生成的公钥**添加到 GitHub 仓库 **Settings → Deploy keys**，只授予读取权限，再填写 hPanel 要求的 SSH 仓库地址。不要把私钥、GitHub token 或带 token 的仓库 URL 写入文件或聊天。
4. 选择仓库、`main` 分支和部署目录。目标必须是 **该网站实际的 `public_html` 根目录**；有些界面的目录为空表示根目录，有些显示相对于 `public_html` 的路径。按界面说明核对，避免生成 `public_html/public_html` 或把代码部署进同名子文件夹。
5. 新建 Git 安装通常要求目标目录为空。若有默认欢迎页，先备份到文档根目录之外，再移除该默认页；若已有真实网站，先完成其备份与切换计划，不要直接清空。服务器私有配置放在 `public_html` 外，不会阻碍空目录检查。
6. 点击 **Create / Install / Deploy**，等待成功并检查部署日志。确认 `public_html/index.html`、`app.js`、`api.php`、`config.php` 和 `.htaccess` 位于同一层。
7. hPanel 原生 Git 部署可能检出整个仓库，因此也可能带上 SQL、测试和文档；本项目 `.htaccess` 会拒绝它们的 Web 访问。`.git` 目录也必须无法通过 HTTP 访问。不要修改 Git 管理文件来手动“修复”下一次部署。
8. 按页面提供的 **Automatic deployment / 自动部署**功能启用后续推送发布；旧界面可能要求把其生成的 webhook URL 添加到 GitHub 仓库 **Settings → Webhooks**。只使用 hPanel 展示的真实地址及设置，保护部署 URL 中的令牌。
9. 确认自动部署分支为 `main`。首次建议手动部署并按第 9 节验收，再启用自动部署。每次推送都可能覆盖服务器上的受 Git 管理文件，服务器私有配置因此必须继续放在仓库外。

若 Business 网站管理页没有 Git 功能入口或该账户的功能未启用，直接使用方式 B；这个 PHP 项目不依赖 Git 自动部署才能运行。

## 7. 方式 B：GitHub ZIP + File Manager + phpMyAdmin

适合第一次上线或没有 Git 功能的账户。

1. GitHub 仓库 **Code → Download ZIP**，在自己的电脑解压。GitHub 通常额外包一层 `record-main/`，它不是网站根目录。
2. 只从解压结果中选出以下文件，重新打包为部署 ZIP，保证 ZIP 根目录直接包含 `index.html`：

   ```text
   .htaccess
   index.html
   app.js
   api.php
   config.php
   manifest.webmanifest
   sw.js
   icon.svg
   icon-192.png
   icon-512.png
   ```

3. 不要把 `hub-private.php`、数据库备份、`.env`、`.git`、测试、文档、配置示例或 `DriveUploader.gs` 放进这个公开部署包。导入用的 `database.sql` 留在电脑上，通过 phpMyAdmin 上传，不放网站目录。
4. hPanel 进入正确网站 **Files → File Manager → public_html**。先备份现有内容，再上传部署 ZIP 并解压；确认没有多余的 `record-main/` 外层目录。
5. 开启 File Manager 的“显示隐藏文件”，确认 `.htaccess` 实际存在。解压完成后删除网站目录内的部署 ZIP，避免它成为公开下载入口；不要删除站外备份。
6. 在 File Manager 返回 `public_html` 上一级，创建 `hub-private.php`，粘贴 `config.example.php` 的模板，并只在这里填写真实配置。目录权限通常 `755`，公开文件通常 `644`；私有配置在主机允许且 PHP 可读取时用 `600`，不要设置 `777`。
7. 如果 File Manager 仅显示 `public_html` 而无法返回父目录，使用该套餐的 SSH/SFTP 或账户级 File Manager 定位网站父目录，并确认 PHP `open_basedir` 允许读取。这个路径权限未解决前不要把密钥放回公开目录；查 Hostinger 的账户路径设置或联系其支持。
8. 按第 4 节完成数据库导入；按第 5 节设置哈希，`HUB_ORIGIN` 填实际临时域名。

## 8. `.htaccess` 的生效范围与缓存

文件兼容 Apache 2.4 / Hostinger LiteSpeed，主要规则：

- `Options -Indexes -MultiViews` 禁止目录列表和隐式文件名协商，`DirectoryIndex index.html` 指定首页。
- 拒绝隐藏路径、`.git/config`、`.env`、配置模板、SQL、日志、备份包和测试 / 文档目录；PHP 自身仍能 `require config.php`。`.well-known` 保留给主机证书验证。
- HTTPS 规则使用 308 跳转，保留请求方法；应在 SSL 正常后启用。优先使用服务器的 `HTTPS` 标记，不信任浏览器可自行设置的 `X-Forwarded-Proto`。
- PHP 响应 `no-store, private`；首页、Service Worker、manifest 必须重新验证；未带内容哈希的 JS/CSS 缓存最多一小时，图标 / 图片最多七天，不设置永久 immutable。
- 对文字、JS、CSS、JSON、SVG 启用支持时的 gzip 压缩，不重复压缩 JPEG / PNG。增加 MIME、防 iframe 嵌入及基本浏览器安全响应头。

这里的“防目录遍历”包括禁目录列表、拦截隐藏目录与敏感文件；真正的文件系统路径穿越还依赖主机服务器的路径规范化、补丁和权限。应用不提供按用户路径读取服务器文件的接口。`.htaccess` 不能代替把密钥放在文档根目录之外。

如果启用了 Hostinger Cache Manager、CDN 或其他整站缓存，确保 **`api.php` 及全部 action 查询参数均绕过整页缓存**，且不会缓存带 Cookie 的 API 响应。不同账户的缓存入口可能不同；不能配置排除时，先关闭这个 PHP 网站的整页缓存。浏览器静态资源缓存仍可使用。

只有主机将 TLS 终止到独立代理且未正确设置 `HTTPS` 时，才可能出现循环跳转。先检查 hPanel SSL 与 Force HTTPS 设置，必要时让主机支持确认服务器信任的代理标记；不要直接相信所有来源的转发请求头或关闭 HTTPS 来“修复”。

## 9. 上线验收清单

在浏览器中使用实际临时域名：

1. 访问 HTTP 首页应跳到同域 HTTPS；HTTPS 无证书警告，页面显示 Life Hub 密码门禁。
2. 未登录打开 `/api.php?action=session`，得到 `ok:true`、`authenticated:false` 与 CSRF 令牌；`/api.php?action=export` 必须返回 401，不能显示数据。
3. 解锁后在一个模块新增记录，在手机或另一浏览器登录后，点击“立即同步”或等待最多约 30 秒，应出现同一条记录。修改与删除同样验证。
4. 在汇率弹窗设置 MYR 参考汇率，切换 SGD/MYR，确认看板改变、记录原币仍保留。
5. 新建各模块记录并导出 Excel，确认八个 Sheet；上传一张收据验证缩略图、Drive 查看链接和保存后的重开行为。Drive 未配置时上传失败不会阻止其他功能。
6. DevTools Network 查看 `api.php` 响应必须包含 `Cache-Control: no-store`；`sw.js` 和 `index.html` 为 `no-cache`；`app.js` 至多缓存一小时；图标至多七天。
7. 用下列路径做直接访问检查，必须返回 **403 或 404，不能下载源码或文件内容**：`/.git/config`、`/.env`、`/config.php`、`/config.example.php`、`/hub-private.php`、`/database.sql`、`/DriveUploader.gs`、`/tests/frontend.cjs`、`/DEPLOYMENT.md`。`.git` 等未部署的文件返回 404 是正常结果。
8. 访问一个确实存在、没有首页文件的普通目录，不能出现文件列表。不要为了这个检查将敏感备份上传到公开目录。
9. 退出后，页面重新显示门禁，重新读取 export 返回 401。HTTPS 下可按浏览器菜单添加到主屏幕。

本机有 curl 时可快速检查公开路径，不要把密码写入命令：

```sh
curl -I http://你的实际临时域名/
curl -I https://你的实际临时域名/
curl -I https://你的实际临时域名/app.js
curl -I https://你的实际临时域名/sw.js
curl -i 'https://你的实际临时域名/api.php?action=session'
curl -i 'https://你的实际临时域名/api.php?action=export'
curl -I https://你的实际临时域名/.git/config
curl -I https://你的实际临时域名/config.example.php
```

## 10. 后续更新与回退

1. 更新前备份数据库，并在文档根目录之外保留上一版本公开文件；`hub-private.php` 始终单独保留。
2. Git 方式推送到指定分支并检查部署结果；手动方式只上传上述公开部署文件，不覆盖真实配置。
3. 前端版本更新时增加 `sw.js` 的 `CACHE` 版本号，然后清理 hPanel / CDN 静态缓存并重新打开页面。未版本化的 `app.js` 最长可能保留一小时的浏览器缓存，发布后必要时强制刷新。
4. 首先按第 9 节复查；代码回退只恢复上一版本公开文件，不导入旧 SQL 覆盖新数据。涉及数据库结构变更时需要匹配的迁移 / 回退方案。
5. 将来改用正式域名时，先在 hPanel 完成域名和 SSL 连接，再更新私有配置 `HUB_ORIGIN`，重新登录并验证 CSRF、Drive、PWA；旧域名 Cookie 和安装图标不会自动迁移到新来源。

## 本次本地验证范围

`tests/deployment.py` 已在临时 Apache 2.4 HTTPS 服务器验证：Git 忽略规则、HTTPS 308 重定向、敏感路径拒绝、禁目录列表、证书验证目录放行、API / 静态资源缓存头及 gzip。测试证书仅用于本地并由测试客户端显式信任，未关闭 TLS 验证。配置模板也通过 PHP 语法与空密钥检查。

这份配置清单与本地测试本身不代表已经完成 GitHub 发布或 Hostinger 上线。LiteSpeed / hPanel 的实际生效情况必须在你的目标网站按第 9 节验收；本地 Apache 测试不能替代线上检查。
