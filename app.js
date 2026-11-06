'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = name => `<i data-lucide="${escapeHTML(name)}" class="icon" aria-hidden="true"></i>`;
  const modules = {
    purchases: { title: '购买物品', english: 'Purchases', icon: 'shopping-bag', description: '每一份喜爱，都值得好好记录。', fields: {
      name: '物品名称', category: '分类', amount: '购买金额', currency: '原始币种', purchase_date: '购买日期', merchant: '购买平台 / 商家', payment_method: '使用的卡 / 支付方式', warranty_expiry: '保修到期日', receipt_url: '收据图片', notes: '备注'
    } },
    investments: { title: '长期投资', english: 'Investments', icon: 'chart-no-axes-combined', description: '让时间成为资产的一部分。', fields: {
      name: '投资标的 / 名称', broker: '平台 / 券商', asset_class: '资产类别', principal: '投入本金', current_value: '当前市值', currency: '原始币种', buy_date: '买入日期', status: '持有状态', receipt_url: '投资凭证图片', notes: '备注'
    } },
    temp_investments: { title: '临时投资', english: 'Short-term', icon: 'zap', description: '短期项目、每次回款与实际收益。', fields: {
      name: '项目名称', amount: '投入金额', currency: '原始币种', start_date: '开始日期', expected_settlement_date: '预计结算日期', actual_settlement_date: '实际结算日期', status: '项目状态', recovered_amount: '实际收回金额', receipt_url: '收据 / 截图', notes: '备注'
    } },
    subscriptions: { title: '订阅管理', english: 'Subscriptions', icon: 'repeat-2', description: '只为真正需要的服务持续付费。', fields: {
      name: '软件 / 服务名称', url: '服务网址', icon_url: '图标网址', amount: '每期扣款金额', currency: '原始币种', billing_cycle: '扣款周期', next_billing_date: '下次扣款日期', card_name: '绑定卡片名称', status: '订阅状态', notes: '备注'
    } },
    savings: { title: '存钱计划', english: 'Savings', icon: 'piggy-bank', description: '把一点点积累，变成心里的底气。', fields: {
      name: '银行 / 账户名称', deposit_type: '存款类型', balance: '当前余额', target_amount: '目标金额', currency: '原始币种', annual_rate: '年化利率 (%)', last_updated_date: '最后更新日期', notes: '备注'
    } },
    currencies: { title: '外币余钱', english: 'Currencies', icon: 'coins', description: '从旅行信封到多币种账户，余钱都有归处。', fields: {
      currency: '持有币种', holding_type: '持有形式', amount: '剩余外币金额', acquisition_rate: '获取汇率（1 原币 = 多少 SGD）', reference_value: '参考价值', reference_currency: '参考价值币种', location: '存放位置 / 所属卡片', notes: '备注'
    } },
    cards: { title: '卡片管理', english: 'Cards', icon: 'credit-card', description: '常用卡片、福利与账单信息，随时查阅。', fields: {
      name: '卡片名称', issuer: '发卡机构 / 银行', card_type: '卡类型', last_four: '卡号后 4 位', currency: '支持主币种', benefits: '核心福利 / 返现规则', annual_fee_conditions: '年费条件', statement_day: '账单日（每月）', payment_due_day: '还款日（每月）', status: '卡片状态', image_url: '卡片外观图', notes: '备注'
    } },
    passwords: { title: '账号备忘', english: 'Accounts', icon: 'key-round', description: '保存账号线索，仅填提示语，不记录真实密码。', fields: {
      name: '网站 / App 名称', url: '网站 URL', username: '登录用户名 / Email', password_hint: '密码提示语 / 记忆码（仅填提示语）', phone_2fa_memo: '绑定手机 / 2FA 备忘', reference_url: '参考截图', tags: '分类标签', notes: '备注'
    } }
  };
  const currencyNames = { SGD: '新加坡元', MYR: '马来西亚令吉', JPY: '日元', VND: '越南盾', CNY: '人民币', THB: '泰铢', USD: '美元', HKD: '港币', TWD: '新台币', EUR: '欧元', GBP: '英镑', AUD: '澳元', NZD: '新西兰元', KRW: '韩元', IDR: '印尼盾', PHP: '菲律宾比索', CHF: '瑞士法郎', CAD: '加拿大元' };
  const state = {
    authenticated: false, csrf: '', epoch: 0, loaded: false, schema: {}, currencies: [],
    records: [], groups: Object.fromEntries(Object.keys(modules).map(key => [key, []])),
    settings: { base_currency: 'SGD', rates_to_sgd: { SGD: '1' } }, settingsVersion: 0,
    page: 'dashboard', filter: '', sort: 'updated', editor: null, dirty: false, saving: false,
    uploading: false, deleting: false, ratesBusy: false, ratesDirty: false, ratesVersion: 0,
    refreshPromise: null, lastSync: null, dataRevision: 0, controllers: new Set()
  };

  function icons() {
    window.lucide?.createIcons({ attrs: { 'stroke-width': 1.65 } });
  }
  function toast(message, error = false) {
    // Avoid covering the workspace when several quick saves finish together.
    for (const existing of $$('#toasts .toast')) {
      if (existing.textContent === message) existing.remove();
    }
    while ($('#toasts').children.length >= 2) $('#toasts').firstElementChild.remove();
    const item = document.createElement('div');
    item.className = `toast${error ? ' error-toast' : ''}`;
    item.textContent = message;
    $('#toasts').append(item);
    setTimeout(() => item.remove(), error ? 9000 : 4500);
  }
  function safeURL(value, image = false) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
      if (image && (url.protocol !== 'https:' || !['drive.google.com', 'lh3.googleusercontent.com'].includes(url.hostname))) return '';
      return url.href;
    } catch { return ''; }
  }
  function driveView(value) {
    const url = safeURL(value, true);
    if (!url) return '';
    const parsed = new URL(url);
    const id = parsed.searchParams.get('id') || parsed.pathname.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1];
    return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : url;
  }
  function today() {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  }
  function daysUntil(date) {
    return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);
  }
  function scaled(value, precision = 4) {
    const text = String(value ?? '0');
    if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error('无效金额或汇率');
    const negative = text.startsWith('-');
    const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
    return (BigInt(whole) * 10n ** BigInt(precision) + BigInt((fraction + '0'.repeat(precision)).slice(0, precision))) * (negative ? -1n : 1n);
  }
  function decimal(value, precision = 4) {
    const negative = value < 0n;
    const digits = (negative ? -value : value).toString().padStart(precision + 1, '0');
    return `${negative ? '-' : ''}${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
  }
  function roundedDivide(value, divisor) {
    const sign = value < 0n ? -1n : 1n;
    return sign * (((value < 0n ? -value : value) + divisor / 2n) / divisor);
  }
  function formatScaled(value, currency, detailed = false) {
    let number = value;
    let places = 4;
    if (!detailed) { number = roundedDivide(number, 100n); places = 2; }
    const negative = number < 0n;
    const magnitude = negative ? -number : number;
    const factor = 10n ** BigInt(places);
    const whole = new Intl.NumberFormat('en-SG').format(magnitude / factor);
    let fraction = (magnitude % factor).toString().padStart(places, '0');
    if (detailed) fraction = fraction.replace(/0+$/, '').padEnd(2, '0');
    return `${negative ? '−' : ''}${currency} ${whole}.${fraction}`;
  }
  const money = (value, currency) => formatScaled(scaled(value), currency, true);
  function convert(value, currency) {
    const rates = state.settings.rates_to_sgd;
    const from = rates[currency];
    const to = rates[state.settings.base_currency];
    if (!from || !to || scaled(from, 8) <= 0n || scaled(to, 8) <= 0n) return null;
    return roundedDivide(value * scaled(from, 8), scaled(to, 8));
  }
  function total(rows, valueForRow) {
    let value = 0n;
    const missing = new Set();
    for (const row of rows) {
      const amount = valueForRow(row);
      if (amount === null) continue;
      const converted = convert(amount, row.data.currency);
      if (converted === null) missing.add(row.data.currency);
      else value += converted;
    }
    return { value, missing: [...missing] };
  }
  function totalHTML(result) {
    return `<span>${escapeHTML(formatScaled(result.value, state.settings.base_currency))}</span>${result.missing.length ? `<small class="negative">部分合计 · 缺少 ${escapeHTML(result.missing.join(' / '))} 汇率</small>` : ''}`;
  }
  function recordName(row) {
    return row.data.name || `${row.data.currency} · ${row.data.location}`;
  }
  function amountFor(row) {
    const data = row.data;
    if (row.module_type === 'investments') return data.current_value;
    if (row.module_type === 'savings') return data.balance;
    return data.amount ?? null;
  }
  function originalAmount(row) {
    const amount = amountFor(row);
    return amount === null ? (row.module_type === 'cards' ? row.data.currency : '账号备忘') : money(amount, row.data.currency);
  }
  function amountHTML(row) {
    const amount = amountFor(row);
    if (amount === null) return `<span class="muted small">${escapeHTML(originalAmount(row))}</span>`;
    const converted = convert(scaled(amount), row.data.currency);
    return `<div class="money">${escapeHTML(money(amount, row.data.currency))}</div>${row.data.currency !== state.settings.base_currency ? `<div class="amount-sub">${converted === null ? '未设置汇率' : `≈ ${escapeHTML(formatScaled(converted, state.settings.base_currency))}`}</div>` : ''}`;
  }
  function rowSubtitle(row) {
    const d = row.data;
    switch (row.module_type) {
      case 'purchases': return [d.category, d.merchant || '未填写商家'].join(' · ');
      case 'investments': return [d.asset_class, d.broker || '未填写平台'].join(' · ');
      case 'temp_investments': return `开始于 ${d.start_date}`;
      case 'subscriptions': return [d.billing_cycle, d.card_name || '未绑定卡片'].join(' · ');
      case 'savings': return [d.deposit_type, d.annual_rate === null ? '未填写利率' : `${d.annual_rate}% 年化`].join(' · ');
      case 'currencies': return d.holding_type;
      case 'cards': return [d.issuer || d.card_type, d.last_four ? `尾号 ${d.last_four}` : '未填卡号'].join(' · ');
      case 'passwords': return d.username || d.tags || '仅保存账号与提示语';
      default: return '';
    }
  }
  function statusHTML(row) {
    const d = row.data;
    if (row.module_type === 'subscriptions' && d.status === '订阅中') {
      const days = daysUntil(d.next_billing_date);
      if (days < 0) return '<span class="pill bad">扣款日期已过，请更新</span>';
      if (days < 7) return `<span class="pill warn">${days === 0 ? '今天扣款' : `${days} 天后扣款`}</span>`;
    }
    if (row.module_type === 'purchases' && d.warranty_expiry) {
      return `<span class="pill ${daysUntil(d.warranty_expiry) < 0 ? '' : 'good'}">${daysUntil(d.warranty_expiry) < 0 ? '保修已过期' : '保修期内'}</span>`;
    }
    if (row.module_type === 'passwords') return `<span class="pill">${escapeHTML(d.tags || '仅填提示语')}</span>`;
    if (row.module_type === 'savings') {
      const target = d.target_amount === null ? 0n : scaled(d.target_amount);
      if (target > 0n) {
        const percentage = Number(scaled(d.balance) * 10000n / target) / 100;
        return `<span class="pill ${percentage >= 100 ? 'good' : 'accent'}">目标 ${percentage.toFixed(1)}%</span><div class="progress-track" role="progressbar" aria-label="储蓄目标进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, percentage)}"><div class="progress-fill" style="width:${Math.min(100, percentage)}%"></div></div>`;
      }
      return '<span class="pill">未设目标</span>';
    }
    const text = d.status || (row.module_type === 'currencies' ? d.holding_type : d.category || '已记录');
    const active = ['持有中', '进行中', '订阅中', '使用中'].includes(text);
    return `<span class="pill ${active ? 'good' : ''}">${escapeHTML(text)}</span>`;
  }
  function extraHTML(row) {
    const d = row.data;
    switch (row.module_type) {
      case 'purchases': return escapeHTML(d.purchase_date);
      case 'investments': {
        const profit = scaled(d.current_value) - scaled(d.principal);
        return `<span class="${profit < 0n ? 'negative' : 'positive'}">${escapeHTML(formatScaled(profit, d.currency))}</span><div class="record-sub">市值 − 本金</div>`;
      }
      case 'temp_investments': {
        const profit = d.recovered_amount === null ? null : scaled(d.recovered_amount) - scaled(d.amount);
        return profit === null ? '<span class="muted">尚无回款</span>' : `<span class="${profit < 0n ? 'negative' : 'positive'}">${escapeHTML(formatScaled(profit, d.currency))}</span><div class="record-sub">已回款 − 投入</div>`;
      }
      case 'subscriptions': return `${escapeHTML(d.next_billing_date)}<div class="record-sub">${escapeHTML(d.billing_cycle)}</div>`;
      case 'savings': return escapeHTML(d.last_updated_date);
      case 'currencies': return escapeHTML(d.location);
      case 'cards': return `<span class="muted">账单 ${escapeHTML(d.statement_day ?? '—')} 日 / 还款 ${escapeHTML(d.payment_due_day ?? '—')} 日</span>`;
      case 'passwords': {
        const url = safeURL(d.url);
        return url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">打开网站 ↗</a>` : '<span class="muted">未填写网址</span>';
      }
      default: return '';
    }
  }

  class APIError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }
  async function api(action, body = null, query = {}) {
    const epoch = state.epoch;
    const controller = new AbortController();
    state.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), action === 'upload' ? 105000 : 25000);
    try {
      const url = new URL('api.php', window.location.href);
      url.searchParams.set('action', action);
      Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await fetch(url, {
        method: body === null ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: body === null ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
        ...(body === null ? {} : { body: JSON.stringify(body) })
      });
      if (epoch !== state.epoch) throw new APIError('会话已改变', 0);
      let result;
      try { result = await response.json(); } catch { throw new APIError('服务器没有返回 JSON，请检查 PHP 配置与上传大小限制。', response.status); }
      if (epoch !== state.epoch) throw new APIError('会话已改变', 0);
      if (!response.ok || result.ok !== true) {
        if (response.status === 401 && action !== 'login') lock('会话已过期，请重新解锁。');
        if (response.status === 403 && action !== 'session') {
          // Refresh CSRF for the user's next attempt; never automatically replay a write.
          const session = await api('session');
          if (!session.authenticated && action !== 'login') lock('会话已过期，请重新解锁。');
        }
        throw new APIError(result.error || `请求失败（${response.status}）`, response.status);
      }
      if (result.csrf_token) state.csrf = result.csrf_token;
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new APIError(body === null ? '连接超时，请检查网络。' : '连接超时，操作结果尚未确认。请先同步确认，避免重复提交。', 0);
      if (error instanceof APIError) throw error;
      throw new APIError('无法连接服务器，请检查网络后重试。', 0);
    } finally {
      clearTimeout(timeout);
      state.controllers.delete(controller);
    }
  }
  function lock(message = '') {
    state.epoch++;
    for (const controller of state.controllers) controller.abort();
    state.controllers.clear();
    Object.assign(state, { authenticated: false, csrf: '', loaded: false, records: [], schema: {}, currencies: [], editor: null, dirty: false, saving: false, uploading: false, deleting: false, ratesBusy: false, ratesDirty: false, refreshPromise: null, settingsVersion: 0 });
    state.groups = Object.fromEntries(Object.keys(modules).map(key => [key, []]));
    state.settings = { base_currency: 'SGD', rates_to_sgd: { SGD: '1' } };
    $$('dialog[open]').forEach(dialog => dialog.close());
    $('#app').hidden = true;
    $('#app').inert = true;
    $('#gate').hidden = false;
    $('#record-fields').replaceChildren();
    $('#rates-fields').replaceChildren();
    $('#record-derived').replaceChildren();
    $('#record-error').textContent = '';
    $('#record-title').textContent = '新增记录';
    $('#record-subtitle').textContent = '';
    $('#delete-name').textContent = '';
    $('#content').replaceChildren();
    $('#search-results').replaceChildren();
    $('#search-results').hidden = true;
    $('#global-search').value = '';
    $('#global-search').setAttribute('aria-expanded', 'false');
    $('#toasts').replaceChildren();
    $('#loading').hidden = true;
    $('#login-password').value = '';
    $('#login-password').type = 'password';
    $('#login-error').textContent = message;
    $('#login-password').disabled = true;
    $('#login-submit').disabled = true;
    $('#login-submit span').textContent = '解锁我的空间';
    $('#connection-retry').hidden = false;
    $('#connection-retry').textContent = '重新连接服务器';
    renderNavigation();
    icons();
  }
  async function connect() {
    $('#connection-retry').disabled = true;
    $('#loading').hidden = false;
    $('#login-error').textContent = '';
    try {
      const session = await api('session');
      if (session.authenticated) await unlock();
      else {
        $('#login-password').disabled = false;
        $('#login-submit').disabled = false;
        $('#login-submit span').textContent = '解锁我的空间';
        $('#connection-retry').hidden = true;
        $('#login-password').focus();
      }
    } catch (error) {
      $('#login-error').textContent = error.message;
      $('#connection-retry').hidden = false;
      $('#login-submit span').textContent = '等待连接';
    } finally {
      $('#connection-retry').disabled = false;
      $('#loading').hidden = true;
    }
  }
  async function unlock() {
    state.authenticated = true;
    $('#login-password').value = '';
    $('#gate').hidden = true;
    $('#app').hidden = false;
    $('#app').inert = false;
    state.page = pageFromHash();
    renderNavigation();
    renderPage();
    await refresh(true);
  }
  async function refresh(showLoading = false) {
    if (!state.authenticated) return;
    if (state.refreshPromise) return state.refreshPromise;
    const epoch = state.epoch;
    const revision = state.dataRevision;
    const task = (async () => {
      if (showLoading) $('#loading').hidden = false;
      $('#sync-status').textContent = '正在同步…';
      try {
        const [schemaResult, all, preferences] = await Promise.all([
          Object.keys(state.schema).length ? Promise.resolve(null) : api('schema'), api('export'), api('settings')
        ]);
        if (epoch !== state.epoch) return;
        if (revision !== state.dataRevision) return;
        if (schemaResult) {
          for (const [module, meta] of Object.entries(modules)) {
            if (!schemaResult.modules[module] || Object.keys(meta.fields).some(key => !schemaResult.modules[module][key])) throw new Error('前后端字段版本不一致，请更新同一版本的文件。');
          }
          state.schema = schemaResult.modules;
          state.currencies = schemaResult.currencies;
        }
        state.groups = all.modules;
        state.records = Object.values(all.modules).flat().sort((a, b) => b.updated_at.localeCompare(a.updated_at) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
        state.settings = preferences.settings;
        state.settingsVersion = preferences.version;
        state.loaded = true;
        state.lastSync = new Date();
        $('#sync-error').hidden = true;
        renderNavigation();
        renderPage();
        renderSearch();
      } catch (error) {
        if (!state.authenticated || epoch !== state.epoch) return;
        $('#sync-error').textContent = `${error.message}${state.loaded ? ' 当前显示上次成功同步的数据。' : ' 点击“立即同步”重试。'}`;
        $('#sync-error').hidden = false;
        $('#sync-status').textContent = '同步失败';
        if (!state.loaded) $('#content').innerHTML = `<div class="panel empty">${icon('cloud-off')}<h2>暂时无法载入记录</h2><p>请检查服务器连接和配置，然后重试同步。</p><button class="btn" data-action="refresh">重新同步</button></div>`;
        icons();
      } finally {
        if (epoch === state.epoch) {
          if (showLoading) $('#loading').hidden = true;
          state.refreshPromise = null;
        }
      }
    })();
    state.refreshPromise = task;
    return task;
  }

  function pageFromHash() {
    const page = window.location.hash.slice(1);
    return modules[page] ? page : 'dashboard';
  }
  function navigate(page) {
    closeSearch();
    $('#mobile-drawer').close();
    if (state.page !== page) { state.filter = ''; state.sort = 'updated'; }
    state.page = modules[page] ? page : 'dashboard';
    if (window.location.hash !== `#${state.page}`) history.replaceState(null, '', `#${state.page}`);
    renderNavigation();
    renderPage();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function navButton(key, title, symbol, count = '') {
    return `<button class="nav-item ${state.page === key ? 'active' : ''}" data-page="${key}" ${state.page === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${escapeHTML(title)}</span><span class="count">${count}</span></button>`;
  }
  function renderNavigation() {
    const entries = Object.entries(modules);
    const html = navButton('dashboard', '空间总览', 'layout-dashboard') + entries.map(([key, meta]) => navButton(key, meta.title, meta.icon, state.loaded ? state.groups[key]?.length || 0 : '')).join('');
    $('#desktop-nav').innerHTML = html;
    $('#drawer-nav').innerHTML = html;
    const bottom = [['dashboard', '总览', 'layout-dashboard'], ['purchases', '购买', 'shopping-bag'], ['investments', '投资', 'chart-no-axes-combined'], ['subscriptions', '订阅', 'repeat-2']];
    $('#bottom-nav').innerHTML = bottom.map(([key, title, symbol]) => `<button class="bottom-item ${state.page === key ? 'active' : ''}" data-page="${key}" ${state.page === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${title}</span></button>`).join('') + `<button class="bottom-item ${bottom.some(([key]) => key === state.page) ? '' : 'active'}" data-action="drawer">${icon('grid-2x2')}<span>全部</span></button>`;
    icons();
  }
  function statCard(title, symbol, result, footnote) {
    return `<article class="panel stat"><div class="row between"><span class="stat-label">${title}</span><span class="muted">${icon(symbol)}</span></div><div class="stat-number">${totalHTML(result)}</div><small>${footnote}</small></article>`;
  }
  function monthlyAmount(row) {
    const amount = scaled(row.data.amount);
    return row.data.billing_cycle === '月付' ? amount : roundedDivide(amount, row.data.billing_cycle === '季付' ? 3n : 12n);
  }
  function dashboardHTML() {
    const groups = state.groups;
    const purchaseTotal = total(groups.purchases, row => scaled(row.data.amount));
    const invested = total(groups.investments.filter(row => row.data.status === '持有中'), row => scaled(row.data.current_value));
    const saved = total(groups.savings, row => scaled(row.data.balance));
    const subscriptions = total(groups.subscriptions.filter(row => row.data.status === '订阅中'), monthlyAmount);
    const overview = statCard('已记录购买', 'shopping-bag', purchaseTotal, `${groups.purchases.length} 件物品 · 累计购买金额`)
      + statCard('持有投资市值', 'chart-no-axes-combined', invested, '仅长期持仓 · 不含临时项目')
      + statCard('账户储蓄余额', 'piggy-bank', saved, `${groups.savings.length} 个账户 · 按最新记录`)
      + statCard('每月订阅预算', 'repeat-2', subscriptions, '有效订阅 · 季付 / 年付按月摊算');
    const upcoming = groups.subscriptions.filter(row => row.data.status === '订阅中' && daysUntil(row.data.next_billing_date) < 7).sort((a, b) => a.data.next_billing_date.localeCompare(b.data.next_billing_date));
    const tiles = Object.entries(modules).map(([key, meta]) => {
      const rows = groups[key];
      let detail = `${rows.length} 条记录`;
      if (key === 'cards') detail = `${rows.filter(row => row.data.status === '使用中').length} 张使用中`;
      else if (key === 'passwords') detail = `${rows.length} 份账号备忘`;
      else if (key === 'subscriptions') detail = `${rows.filter(row => row.data.status === '订阅中').length} 项订阅中`;
      else if (key === 'temp_investments') detail = `${rows.filter(row => row.data.status === '进行中').length} 个进行中`;
      else if (key === 'currencies') detail = `${new Set(rows.map(row => row.data.currency)).size} 种外币`;
      else if (key === 'savings') detail = `${rows.length} 个储蓄账户`;
      else if (key === 'investments') detail = `${rows.filter(row => row.data.status === '持有中').length} 项持有中`;
      else detail = `${rows.length} 件已购好物`;
      return `<button class="module-tile" data-page="${key}"><div class="row between"><span class="icon-box">${icon(meta.icon)}</span><span class="muted">${icon('arrow-up-right')}</span></div><div><h3>${meta.title}</h3><p>${meta.english}</p></div><div class="tile-value">${detail}</div></button>`;
    }).join('');
    const recent = state.records.slice(0, 6);
    return `<div class="overview-grid">${overview}</div><div class="notice">金额按手动参考汇率折算为 ${state.settings.base_currency}，原币始终保留。各项独立展示，请勿相加视为净资产。</div>
      ${upcoming.length ? `<div class="section-heading"><h2>近期扣款提醒</h2><span class="pill warn">${upcoming.length} 项需要留意</span></div><div class="panel section-panel">${upcoming.slice(0, 5).map(recentRow).join('')}</div>` : ''}
      <div class="section-heading"><h2>给生活一点秩序</h2><span class="small muted">8 个模块，一个空间</span></div><div class="module-grid">${tiles}</div>
      <div class="section-heading"><h2>最近更新</h2><span class="small muted">${state.records.length} 条记录</span></div><div class="panel section-panel">${recent.length ? recent.map(recentRow).join('') : emptyHTML('从第一条记录开始', '添加一件新买的物品、一个储蓄账户，或一项常用订阅。', true)}</div>`;
  }
  function recentRow(row) {
    const meta = modules[row.module_type];
    return `<button class="recent-row" data-open="${escapeHTML(row.id)}"><span class="icon-box">${icon(meta.icon)}</span><div style="min-width:0;flex:1"><div class="record-name">${escapeHTML(recordName(row))}</div><div class="record-sub">${meta.title} · ${escapeHTML(rowSubtitle(row))}</div></div><div class="recent-meta"><div>${escapeHTML(originalAmount(row))}</div><div class="record-sub">${row.module_type === 'subscriptions' ? escapeHTML(row.data.next_billing_date) : escapeHTML(row.updated_at.slice(0, 10))}</div></div></button>`;
  }
  function emptyHTML(title, text, add = false) {
    return `<div class="empty"><span class="icon-box">${icon('notebook-pen')}</span><h2>${escapeHTML(title)}</h2><p>${escapeHTML(text)}</p>${add ? `<button class="btn primary" data-action="new">${icon('plus')}添加第一条记录</button>` : ''}</div>`;
  }
  function filteredRecords() {
    let rows = [...(state.groups[state.page] || [])];
    const q = normalize(state.filter);
    if (q) rows = rows.filter(row => searchable(row).includes(q));
    if (state.sort === 'name') rows.sort((a, b) => recordName(a).localeCompare(recordName(b), 'zh-Hans'));
    else if (state.sort === 'amount') rows.sort((a, b) => {
      const av = amountFor(a) === null ? null : convert(scaled(amountFor(a)), a.data.currency);
      const bv = amountFor(b) === null ? null : convert(scaled(amountFor(b)), b.data.currency);
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return av === bv ? 0 : av > bv ? -1 : 1;
    });
    else rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
    return rows;
  }
  function listHTML() {
    return `<div class="panel section-panel"><div class="list-controls"><label class="screen-reader" for="module-filter">筛选当前模块</label><input class="input" id="module-filter" type="search" maxlength="100" value="${escapeHTML(state.filter)}" placeholder="筛选当前模块…"><label class="screen-reader" for="module-sort">记录排序</label><select id="module-sort" class="input"><option value="updated">最近更新</option><option value="name">名称排序</option><option value="amount">折算金额从高到低</option></select></div><div id="list-body"></div></div>`;
  }
  function renderListBody() {
    const rows = filteredRecords();
    const meta = modules[state.page];
    const allCount = state.groups[state.page].length;
    const extraLabel = { purchases: '购买日期', investments: '持仓盈亏', temp_investments: '净收益', subscriptions: '下次扣款', savings: '更新日期', currencies: '存放位置', cards: '账单与还款', passwords: '网址' }[state.page];
    const amountLabel = { investments: '当前市值', savings: '当前余额', subscriptions: '每期费用', cards: '主币种', passwords: '记录类型' }[state.page] || '原币金额';
    const actions = row => `<div class="actions"><button class="btn quiet icon-btn" data-open="${escapeHTML(row.id)}" aria-label="查看或编辑 ${escapeHTML(recordName(row))}" title="查看 / 编辑">${icon('square-pen')}</button></div>`;
    $('#list-body').innerHTML = rows.length ? `<table class="record-table"><thead><tr><th scope="col">${meta.title}</th><th scope="col">${amountLabel}</th><th scope="col">${extraLabel}</th><th scope="col">状态 / 进度</th><th scope="col">操作</th></tr></thead><tbody>${rows.map(row => `<tr><td><div class="table-title"><span class="icon-box">${icon(meta.icon)}</span><button data-open="${escapeHTML(row.id)}"><span class="record-name">${escapeHTML(recordName(row))}</span><div class="record-sub">${escapeHTML(rowSubtitle(row))}</div></button></div></td><td>${amountHTML(row)}</td><td>${extraHTML(row)}</td><td>${statusHTML(row)}</td><td>${actions(row)}</td></tr>`).join('')}</tbody></table>
      <div class="mobile-records">${rows.map(row => `<article class="mobile-card"><div class="card-main"><div style="min-width:0"><h3 class="record-name">${escapeHTML(recordName(row))}</h3><div class="record-sub">${escapeHTML(rowSubtitle(row))}</div></div><span class="icon-box">${icon(meta.icon)}</span></div><div class="row between wrap"><div>${amountHTML(row)}</div><div style="font-size:11px;text-align:right">${extraHTML(row)}</div></div><div class="card-secondary"><div style="max-width:70%">${statusHTML(row)}</div><button class="btn quiet" data-open="${escapeHTML(row.id)}">查看 / 编辑 ${icon('arrow-up-right')}</button></div></article>`).join('')}</div>
      <div class="record-footer"><span>显示 ${rows.length} / ${allCount} 条记录</span><span>金额保留原币 · 参考 ${state.settings.base_currency}</span></div>` : emptyHTML(state.filter ? '没有匹配的记录' : '这里还没有记录', state.filter ? '换一个关键词，或清空当前筛选。' : meta.description, !state.filter);
    icons();
  }
  function renderPage() {
    if (!state.authenticated) return;
    const dashboard = state.page === 'dashboard';
    const meta = modules[state.page];
    $('#breadcrumb-label').textContent = dashboard ? '总览' : meta.title;
    $('#page-title').textContent = dashboard ? '生活与财务，一目了然' : meta.title;
    $('#page-description').textContent = dashboard ? `${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Singapore', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())} · 留一点时间，整理自己的生活。` : meta.description;
    $('#new-button').disabled = !state.loaded;
    $('#currency-toggle').innerHTML = state.settings.base_currency === 'SGD' ? '<strong>SGD</strong><span>⇄ MYR</span>' : '<span>SGD ⇄</span><strong>MYR</strong>';
    $('#currency-toggle').setAttribute('aria-label', `当前主币种 ${state.settings.base_currency}，点击切换`);
    $('#content').setAttribute('aria-busy', String(!state.loaded));
    if (state.loaded) {
      // Keep the local filter's focus/caret when background sync updates the list.
      const focused = document.activeElement?.id === 'module-filter';
      const selection = focused ? $('#module-filter').selectionStart : 0;
      $('#content').innerHTML = dashboard ? dashboardHTML() : listHTML();
      if (!dashboard) {
        $('#module-sort').value = state.sort;
        renderListBody();
        if (focused) { $('#module-filter').focus(); $('#module-filter').setSelectionRange(selection, selection); }
      }
      $('#sync-status').innerHTML = `<span class="sync-dot"></span>已同步 ${escapeHTML(new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(state.lastSync))} · 每 30 秒同步`;
    }
    icons();
  }

  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();
  function searchable(row) {
    return normalize([modules[row.module_type].title, ...Object.values(row.data).filter(value => value !== null)].join(' '));
  }
  function closeSearch() {
    $('#search-results').hidden = true;
    $('#global-search').setAttribute('aria-expanded', 'false');
  }
  function renderSearch() {
    const q = normalize($('#global-search').value);
    if (!q || !state.loaded || !state.authenticated || document.activeElement !== $('#global-search') && !$('#search-results').contains(document.activeElement)) { closeSearch(); return; }
    const matches = state.records.filter(row => searchable(row).includes(q));
    $('#search-results').innerHTML = `<div class="search-caption">跨全部模块 · ${matches.length} 条匹配${matches.length > 40 ? ' · 先显示 40 条，请细化关键词' : ''}</div>${matches.slice(0, 40).map(row => `<button class="search-result" data-search-open="${escapeHTML(row.id)}"><span class="icon-box">${icon(modules[row.module_type].icon)}</span><span class="result-body"><span class="record-name">${escapeHTML(recordName(row))}</span><p class="truncate">${escapeHTML(rowSubtitle(row))}</p></span><span class="pill">${modules[row.module_type].title}</span></button>`).join('') || '<p class="search-caption">还没有找到记录，换个关键词试试。</p>'}`;
    $('#search-results').hidden = false;
    $('#global-search').setAttribute('aria-expanded', 'true');
    icons();
  }

  function fieldHTML(module, key, rule, value) {
    const label = modules[module].fields[key];
    const [type, required, constraint] = rule;
    const id = `field-${key}`;
    const v = value ?? '';
    const attrs = `id="${id}" name="${key}" class="input" ${required ? 'required' : ''}`;
    const wide = type === 'image' || key === 'notes' || ['benefits', 'annual_fee_conditions', 'password_hint', 'phone_2fa_memo'].includes(key);
    let input;
    if (type === 'enum' || type === 'currency') {
      const options = type === 'currency' ? state.currencies : constraint;
      input = `<select ${attrs}>${required ? '' : '<option value="">未填写</option>'}${options.map(option => `<option value="${escapeHTML(option)}" ${v === option ? 'selected' : ''}>${escapeHTML(option)}${type === 'currency' && currencyNames[option] ? ` · ${currencyNames[option]}` : ''}</option>`).join('')}</select>`;
    } else if (type === 'image') {
      const url = safeURL(v, true);
      input = `<div class="upload-box" data-image-field="${key}"><input ${attrs} type="url" value="${escapeHTML(v)}" maxlength="2048" placeholder="上传图片后自动填入 Drive 链接，或粘贴已有链接" aria-label="${escapeHTML(label)}链接"><img class="upload-preview" ${url ? `src="${escapeHTML(url)}"` : ''} alt="${escapeHTML(label)}预览" referrerpolicy="no-referrer" ${url ? '' : 'hidden'}><span class="image-error" hidden>无法内嵌预览，图片可能为私有。请点击在 Drive 查看。</span><div class="upload-controls"><label class="btn small" for="upload-${key}">${icon('image-plus')}选择并上传图片</label><button type="button" class="btn quiet small" data-clear-image="${key}">清除</button><a class="small drive-link" href="${escapeHTML(driveView(url) || '#')}" target="_blank" rel="noopener noreferrer" ${url ? '' : 'hidden'}>在 Drive 查看 ↗</a></div><input id="upload-${key}" type="file" accept="image/jpeg,image/png,image/webp" data-upload="${key}"><p class="upload-status" aria-live="polite">自动压缩至最大宽 1200px · JPEG 质量 0.7 · 经服务器安全上传</p></div>`;
    } else if (type === 'text' && (constraint > 500 || key === 'phone_2fa_memo')) {
      input = `<textarea ${attrs} maxlength="${constraint}" rows="${key === 'notes' ? 3 : 2}" placeholder="${key === 'password_hint' ? '仅填提示语，不填真实密码、恢复码或 2FA 密钥' : '补充你希望记住的信息'}">${escapeHTML(v)}</textarea>`;
    } else if (['money', 'rate', 'percent'].includes(type)) {
      input = `<input ${attrs} type="text" inputmode="decimal" value="${escapeHTML(v)}" pattern="(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,${type === 'money' ? 4 : 8}})?" maxlength="21" placeholder="${required ? '0.00' : '可留空'}" title="请输入非负金额，不使用千位逗号，${type === 'money' ? '最多 4' : '最多 8'} 位小数">`;
    } else if (type === 'day') {
      input = `<input ${attrs} type="number" min="1" max="31" step="1" value="${escapeHTML(v)}" placeholder="1–31">`;
    } else if (type === 'last_four') {
      input = `<input ${attrs} type="text" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" value="${escapeHTML(v)}" placeholder="仅输入后四位，如 0123">`;
    } else {
      input = `<input ${attrs} type="${type === 'date' ? 'date' : type === 'url' ? 'url' : 'text'}" value="${escapeHTML(v)}" ${type === 'text' ? `maxlength="${constraint}"` : type === 'url' ? 'maxlength="2048" placeholder="https://"' : 'min="1000-01-01" max="9999-12-31"'}>`;
    }
    const help = key === 'acquisition_rate' ? '历史获取汇率供备忘；看板统一采用顶部设置中的参考汇率。' : key === 'recovered_amount' ? '未回款可留空。净收益按实际收回 − 投入自动计算。' : key === 'statement_day' || key === 'payment_due_day' ? '每月固定日；不足此天数的月份按月末理解。' : key === 'icon_url' ? '图标链接作为记录保存；列表采用统一图标，避免加载未知追踪图片。' : '';
    return `<div class="field${wide ? ' full-span' : ''}"><label for="${id}">${escapeHTML(label)}${required ? ' <span class="required">*</span>' : ' <span class="muted" style="font-weight:400">选填</span>'}</label>${input}${help ? `<p class="field-help">${help}</p>` : ''}</div>`;
  }
  function defaults(module) {
    const data = {};
    for (const [key, [type, required, options]] of Object.entries(state.schema[module])) {
      if (type === 'currency') data[key] = state.settings.base_currency;
      else if (type === 'enum' && required) data[key] = options[0];
      else if (type === 'date' && required) data[key] = today();
      else data[key] = null;
    }
    return data;
  }
  function fillRecordFields(module, data) {
    $('#record-fields').innerHTML = Object.entries(state.schema[module]).map(([key, rule]) => fieldHTML(module, key, rule, data[key])).join('');
    $('#record-notice').hidden = module !== 'passwords';
    $('#record-subtitle').textContent = state.editor.row ? `${modules[module].title} · 原币数据与完整信息 · 版本 ${state.editor.row.version}` : modules[module].description;
    $('#record-error').textContent = '';
    $('#record-conflict').hidden = true;
    $('#record-derived').hidden = module !== 'temp_investments' && module !== 'savings' && module !== 'investments';
    state.dirty = false;
    setEditorBusy(false);
    updateDerived();
    icons();
  }
  function openNew(module = state.page === 'dashboard' ? 'purchases' : state.page) {
    if (!state.loaded) return toast('请先完成数据同步。', true);
    closeSearch();
    state.editor = { module, row: null };
    $('#record-title').textContent = '新增记录';
    $('#module-picker').hidden = false;
    $('#new-module').innerHTML = Object.entries(modules).map(([key, meta]) => `<option value="${key}">${meta.title}</option>`).join('');
    $('#new-module').value = module;
    $('#delete-button').hidden = true;
    fillRecordFields(module, defaults(module));
    $('#record-dialog').showModal();
  }
  async function openRecord(id) {
    const cached = state.records.find(row => row.id === id);
    if (!cached) return toast('记录不存在，请同步后重试。', true);
    closeSearch();
    // Open with the version the user is actually viewing; writes use that exact version.
    state.editor = { module: cached.module_type, row: structuredClone(cached) };
    $('#record-title').textContent = '查看与编辑记录';
    $('#module-picker').hidden = true;
    $('#delete-button').hidden = false;
    fillRecordFields(cached.module_type, cached.data);
    $('#record-dialog').showModal();
  }
  function closeRecord() {
    if (state.saving || state.uploading) return toast('请等待当前保存或上传完成。');
    if (state.dirty && !window.confirm('当前编辑尚未保存，确定放弃吗？')) return;
    $('#record-dialog').close();
    $('#record-fields').replaceChildren();
    state.editor = null;
    state.dirty = false;
  }
  function setEditorBusy(busy) {
    $('#save-record').disabled = busy;
    $('#save-record span').textContent = state.uploading ? '图片上传中…' : state.saving ? '保存中…' : '保存记录';
    $$('#record-fields input, #record-fields select, #record-fields textarea, #record-fields button, #new-module, #delete-button').forEach(element => { element.disabled = busy; });
  }
  function collectRecord() {
    const data = {};
    for (const [key, [type]] of Object.entries(state.schema[state.editor.module])) {
      const element = $(`[name="${key}"]`, $('#record-form'));
      element.setCustomValidity('');
      const value = element.value.trim();
      if (value === '') { data[key] = null; continue; }
      if ((type === 'url' && !safeURL(value)) || (type === 'image' && !safeURL(value, true))) element.setCustomValidity(type === 'image' ? '请输入 HTTPS Google Drive 图片链接。' : '请输入有效的 HTTP/HTTPS 网址。');
      if (type === 'rate' && scaled(value, 8) <= 0n) element.setCustomValidity('汇率必须大于 0。');
      if (type === 'percent' && Number(value) > 100) element.setCustomValidity('年化利率范围是 0–100。');
      data[key] = type === 'day' ? Number(value) : value;
    }
    if (!$('#record-form').reportValidity()) return null;
    return data;
  }
  function updateDerived() {
    if (!state.editor) return;
    const form = $('#record-form');
    const val = key => $(`[name="${key}"]`, form)?.value || '';
    const currency = val('currency');
    const module = state.editor.module;
    try {
      let text = '';
      if (module === 'temp_investments') text = val('amount') && val('recovered_amount') ? `净收益：${money(decimal(scaled(val('recovered_amount')) - scaled(val('amount'))), currency)}（实际收回 − 投入）` : '净收益：填写投入与实际收回金额后自动计算。';
      if (module === 'investments') text = val('principal') && val('current_value') ? `持仓盈亏：${money(decimal(scaled(val('current_value')) - scaled(val('principal'))), currency)}` : '填写本金与当前市值后，自动计算盈亏。';
      if (module === 'savings') {
        const target = val('target_amount') ? scaled(val('target_amount')) : 0n;
        text = target > 0n && val('balance') ? `储蓄进度：${(Number(scaled(val('balance')) * 10000n / target) / 100).toFixed(1)}%` : '填写大于零的目标金额后，显示储蓄进度。';
      }
      $('#record-derived').textContent = text;
    } catch { $('#record-derived').textContent = '输入有效金额后自动计算。'; }
  }
  async function saveRecord(event) {
    event.preventDefault();
    if (!state.editor || state.saving || state.uploading) return;
    let data;
    try { data = collectRecord(); } catch { return toast('请检查金额与汇率格式。', true); }
    if (!data) return;
    state.saving = true;
    setEditorBusy(true);
    $('#record-error').textContent = '';
    const editor = state.editor;
    try {
      const result = editor.row ? await api('update', { id: editor.row.id, version: editor.row.version, data }) : await api('create', { module: editor.module, data });
      if (!state.authenticated) return;
      applyLocalRecord(result.record);
      state.dirty = false;
      $('#record-dialog').close();
      $('#record-fields').replaceChildren();
      state.editor = null;
      navigate(editor.module);
      toast('记录已保存到云端。');
      void refresh();
    } catch (error) {
      if (!state.authenticated) return;
      $('#record-error').textContent = error.message;
      $('#record-conflict').hidden = error.status !== 409 && error.status !== 404;
    } finally {
      state.saving = false;
      setEditorBusy(false);
    }
  }
  function applyLocalRecord(row, deletedId = null) {
    state.dataRevision++;
    state.records = state.records.filter(item => item.id !== (deletedId || row.id));
    if (row) state.records.unshift(row);
    state.groups = Object.fromEntries(Object.keys(modules).map(module => [module, state.records.filter(item => item.module_type === module)]));
    renderNavigation();
    renderPage();
  }
  async function reloadRecord() {
    if (!state.editor?.row) return;
    if (state.dirty && !window.confirm('这会放弃当前编辑，并载入服务器最新数据。继续吗？')) return;
    try {
      const { record } = await api('get', null, { id: state.editor.row.id });
      state.editor.row = record;
      applyLocalRecord(record);
      fillRecordFields(record.module_type, record.data);
    } catch (error) {
      if (state.authenticated) $('#record-error').textContent = error.status === 404 ? '该记录已被另一设备删除。请关闭弹窗。' : error.message;
    }
  }
  function askDelete() {
    if (!state.editor?.row || state.saving || state.uploading) return;
    $('#delete-name').textContent = recordName(state.editor.row);
    $('#delete-error').textContent = '';
    $('#confirm-delete').disabled = false;
    $('#delete-dialog').showModal();
  }
  async function confirmDelete() {
    if (state.deleting || !state.editor?.row) return;
    state.deleting = true;
    $('#confirm-delete').disabled = true;
    try {
      const row = state.editor.row;
      await api('delete', { id: row.id, version: row.version });
      if (!state.authenticated) return;
      applyLocalRecord(null, row.id);
      $('#delete-dialog').close();
      state.dirty = false;
      closeRecord();
      toast('记录已删除，Drive 附件保留。');
      void refresh();
    } catch (error) {
      if (state.authenticated) {
        $('#delete-error').textContent = error.message;
        if (error.status === 409 || error.status === 404) {
          $('#record-error').textContent = error.message;
          $('#record-conflict').hidden = false;
        }
      }
    } finally { state.deleting = false; $('#confirm-delete').disabled = false; }
  }

  async function compressImage(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPEG、PNG 或 WebP 图片；HEIC 请先转换。');
    if (file.size > 25 * 1024 * 1024) throw new Error('原图不能超过 25MB，请先裁剪或缩小。');
    const objectURL = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('无法读取图片，请换一张图片重试。')); image.src = objectURL; });
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) throw new Error('图片像素过大，请先裁剪。');
      const ratio = Math.min(1, 1200 / image.naturalWidth, 12000 / image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('当前浏览器不支持图片压缩。');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.7));
      canvas.width = canvas.height = 1;
      if (!blob) throw new Error('图片压缩失败，请换一张图片。');
      if (blob.size > 3 * 1024 * 1024) throw new Error('压缩后仍超过 3MB，请裁剪收据后重试。');
      const dataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('无法读取压缩后的图片。'));
        reader.readAsDataURL(blob);
      });
      return { dataURL, size: blob.size };
    } finally { URL.revokeObjectURL(objectURL); }
  }
  function updateImagePreview(box, value) {
    const url = safeURL(value, true);
    const preview = $('.upload-preview', box);
    $('.image-error', box).hidden = true;
    preview.hidden = !url;
    if (url) preview.src = url; else preview.removeAttribute('src');
    const link = $('.drive-link', box);
    link.hidden = !url;
    link.href = driveView(url) || '#';
  }
  async function uploadImage(input) {
    const file = input.files?.[0];
    if (!file || !state.editor || state.uploading || state.saving) return;
    const editor = state.editor;
    const box = input.closest('.upload-box');
    const status = $('.upload-status', box);
    const field = $(`[name="${input.dataset.upload}"]`, box);
    state.uploading = true;
    setEditorBusy(true);
    status.textContent = '正在本地压缩图片…';
    try {
      const image = await compressImage(file);
      if (!state.authenticated || state.editor !== editor) return;
      status.textContent = `已压缩至 ${(image.size / 1024).toFixed(0)} KB，正在上传 Google Drive…`;
      const result = await api('upload', { module: editor.module, image: image.dataURL });
      if (!state.authenticated || state.editor !== editor) return;
      field.value = result.image_url;
      field.setCustomValidity('');
      state.dirty = true;
      updateImagePreview(box, result.image_url);
      // Keep a locally generated thumbnail for private Drive images during editing.
      $('.upload-preview', box).src = image.dataURL;
      $('.upload-preview', box).hidden = false;
      status.textContent = `上传成功 · ${(image.size / 1024).toFixed(0)} KB · ${result.public ? '知道链接的人可查看' : '私有图片，保存后可能需在 Drive 中查看'}。保存记录后才会写入数据库。`;
    } catch (error) {
      if (state.authenticated && state.editor === editor) { status.textContent = error.message; toast(error.message, true); }
    } finally {
      state.uploading = false;
      input.value = '';
      setEditorBusy(false);
    }
  }

  function openRates(base = state.settings.base_currency) {
    if (!state.loaded) return toast('请先完成数据同步。', true);
    state.ratesDirty = false;
    state.ratesVersion = state.settingsVersion;
    $('#rates-base').value = base;
    $('#rates-error').textContent = '';
    $('#reload-rates').hidden = true;
    $('#rates-fields').innerHTML = state.currencies.map(code => `<div class="field"><label for="rate-${code}">${code} <span class="muted">${escapeHTML(currencyNames[code] || '')}</span></label><div class="row"><span class="small muted" style="white-space:nowrap">1 ${code} =</span><input id="rate-${code}" name="${code}" class="input" type="text" inputmode="decimal" pattern="(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,8})?" maxlength="21" placeholder="未设置" value="${escapeHTML(state.settings.rates_to_sgd[code] || '')}" ${code === 'SGD' ? 'readonly required' : ''} aria-label="1 ${code} 可兑换的 SGD"><span class="small muted">SGD</span></div></div>`).join('');
    if (!$('#rates-dialog').open) $('#rates-dialog').showModal();
  }
  function closeRates() {
    if (state.ratesBusy) return;
    if (state.ratesDirty && !window.confirm('汇率修改尚未保存，确定放弃吗？')) return;
    $('#rates-dialog').close();
    state.ratesDirty = false;
  }
  function setRatesBusy(busy) {
    state.ratesBusy = busy;
    $$('#rates-form input, #rates-form select, #rates-form button').forEach(element => { element.disabled = busy; });
    $('#save-rates').textContent = busy ? '保存中…' : '保存汇率';
    $('#currency-toggle').disabled = busy;
  }
  async function savePreferences(base, rates, version) {
    const result = await api('settings_update', { base_currency: base, rates_to_sgd: rates, version });
    state.dataRevision++;
    state.settings = result.settings;
    state.settingsVersion = result.version;
    renderPage();
  }
  async function saveRates(event) {
    event.preventDefault();
    if (state.ratesBusy) return;
    const rates = {};
    for (const input of $$('#rates-fields input')) {
      input.setCustomValidity('');
      const value = input.value.trim();
      if (!value) continue;
      if (!/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,8})?$/.test(value) || scaled(value, 8) <= 0n) { input.setCustomValidity('汇率必须大于零，最多 8 位小数。'); input.reportValidity(); return; }
      rates[input.name] = value;
    }
    const base = $('#rates-base').value;
    if (base === 'MYR' && !rates.MYR) { $('#rates-error').textContent = '选择 MYR 主币种前，请先填写 MYR 参考汇率。'; $('#rate-MYR').focus(); return; }
    setRatesBusy(true);
    $('#rates-error').textContent = '';
    try {
      await savePreferences(base, rates, state.ratesVersion);
      state.ratesDirty = false;
      $('#rates-dialog').close();
      toast('汇率与主币种已同步保存。');
    } catch (error) {
      if (state.authenticated) {
        $('#rates-error').textContent = error.message;
        $('#reload-rates').hidden = error.status !== 409;
      }
    } finally { setRatesBusy(false); }
  }
  async function toggleCurrency() {
    if (!state.loaded || state.ratesBusy) return;
    const next = state.settings.base_currency === 'SGD' ? 'MYR' : 'SGD';
    if (!state.settings.rates_to_sgd[next]) { openRates(next); $('#rates-error').textContent = '请先填写 MYR 汇率，即可切换主币种。'; return; }
    setRatesBusy(true);
    try {
      await savePreferences(next, state.settings.rates_to_sgd, state.settingsVersion);
      toast(`看板已切换为 ${next}，原币明细已保留。`);
    } catch (error) {
      if (state.authenticated) { toast(error.message, true); if (error.status === 409) void refresh(); }
    } finally { setRatesBusy(false); }
  }
  async function reloadRates() {
    if (state.ratesDirty && !window.confirm('放弃当前汇率编辑并载入服务器最新设置？')) return;
    try {
      const result = await api('settings');
      state.settings = result.settings;
      state.settingsVersion = result.version;
      openRates();
      renderPage();
    } catch (error) { if (state.authenticated) $('#rates-error').textContent = error.message; }
  }

  async function exportExcel() {
    if (!state.loaded) return toast('请先完成数据同步。', true);
    if (!window.XLSX) return toast('Excel 导出组件未加载，请检查网络后刷新页面。', true);
    const button = $('#export-button');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const { modules: all } = await api('export');
      const workbook = XLSX.utils.book_new();
      for (const [module, meta] of Object.entries(modules)) {
        const keys = Object.keys(meta.fields);
        const derived = module === 'temp_investments' ? ['净收益（已收回 − 投入）'] : [];
        const headers = ['记录 ID', ...keys.map(key => meta.fields[key]), ...derived, '版本', '创建时间（UTC）', '更新时间（UTC）'];
        const rows = all[module].map(row => [row.id, ...keys.map(key => row.data[key] ?? ''), ...(derived.length ? [row.computed?.net_profit ?? ''] : []), row.version, row.created_at, row.updated_at]);
        // All user fields, including amounts and ID, remain literal strings; no formula objects.
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map(row => row.map(value => String(value)))]);
        worksheet['!cols'] = headers.map(label => ({ wch: label.includes('备注') || label.includes('提示') ? 42 : 23 }));
        worksheet['!autofilter'] = { ref: worksheet['!ref'] };
        XLSX.utils.book_append_sheet(workbook, worksheet, module);
      }
      XLSX.writeFile(workbook, `LifeHub_${today()}.xlsx`, { compression: true });
      toast('八个模块已导出，金额保留原币与原始精度。');
    } catch (error) { if (state.authenticated) toast(error.message, true); }
    finally { button.disabled = false; }
  }
  function toggleTheme() {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('hub-theme', dark ? 'dark' : 'light'); } catch {}
    updateTheme();
  }
  function updateTheme() {
    const dark = document.documentElement.classList.contains('dark');
    $('meta[name="theme-color"]').content = dark ? '#0f172a' : '#f8fafc';
    $$('[data-action="theme"]').forEach(button => {
      button.innerHTML = icon(dark ? 'sun' : 'moon');
      button.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
    });
    icons();
  }
  async function logout() {
    if ((state.dirty || state.ratesDirty) && !window.confirm('有尚未保存的编辑，确定退出并放弃吗？')) return;
    if (state.saving || state.uploading || state.deleting || state.ratesBusy) return toast('请等待当前操作完成后退出。');
    try { await api('logout', {}); lock(); await connect(); }
    catch (error) { if (state.authenticated) toast(`退出未确认：${error.message}`, true); }
  }

  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if ($('#login-submit').disabled) return;
    $('#login-submit').disabled = true;
    $('#login-submit span').textContent = '正在解锁…';
    $('#login-error').textContent = '';
    try { await api('login', { password: $('#login-password').value }); await unlock(); }
    catch (error) { $('#login-error').textContent = error.message; }
    finally { $('#login-submit').disabled = false; $('#login-submit span').textContent = '解锁我的空间'; }
  });
  $('#password-toggle').addEventListener('click', () => {
    const input = $('#login-password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('#password-toggle').setAttribute('aria-pressed', String(show));
    $('#password-toggle').setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    $('#password-toggle').innerHTML = icon(show ? 'eye-off' : 'eye');
    icons();
  });
  $('#connection-retry').addEventListener('click', connect);
  $('#record-form').addEventListener('submit', saveRecord);
  $('#record-form').addEventListener('input', event => {
    if (!event.target.name) return;
    event.target.setCustomValidity?.('');
    state.dirty = true;
    updateDerived();
    if (event.target.closest('.upload-box') && event.target.type === 'url') updateImagePreview(event.target.closest('.upload-box'), event.target.value);
  });
  $('#record-form').addEventListener('change', event => {
    if (event.target.dataset.upload) void uploadImage(event.target);
    else if (event.target.name) { state.dirty = true; updateDerived(); }
  });
  $('#record-fields').addEventListener('error', event => {
    if (!event.target.matches('.upload-preview')) return;
    event.target.hidden = true;
    $('.image-error', event.target.closest('.upload-box')).hidden = false;
  }, true);
  $('#new-module').addEventListener('change', () => {
    const next = $('#new-module').value;
    if (state.dirty && !window.confirm('切换模块会清除当前未保存的表单，确定继续吗？')) { $('#new-module').value = state.editor.module; return; }
    state.editor.module = next;
    fillRecordFields(next, defaults(next));
  });
  $('#rates-form').addEventListener('submit', saveRates);
  $('#rates-form').addEventListener('input', event => { state.ratesDirty = true; event.target.setCustomValidity?.(''); });
  $('#global-search').addEventListener('input', renderSearch);
  $('#global-search').addEventListener('focus', renderSearch);
  $('#global-search').addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeSearch(); event.target.blur(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); $('#search-results button')?.focus(); }
  });
  $('#search-results').addEventListener('keydown', event => {
    const buttons = $$('#search-results button');
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(index + 1) % buttons.length]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); if (index <= 0) $('#global-search').focus(); else buttons[index - 1]?.focus(); }
    if (event.key === 'Escape') { $('#global-search').focus(); closeSearch(); }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'module-filter') { state.filter = event.target.value; renderListBody(); }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'module-sort') { state.sort = event.target.value; renderListBody(); }
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && state.authenticated && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#global-search').focus(); $('#global-search').select(); }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.search-shell')) closeSearch();
    const target = event.target.closest('[data-action], [data-page], [data-open], [data-search-open], [data-clear-image]');
    if (!target || target.disabled) return;
    if (target.dataset.page) return navigate(target.dataset.page);
    if (target.dataset.open) return void openRecord(target.dataset.open);
    if (target.dataset.searchOpen) {
      const row = state.records.find(item => item.id === target.dataset.searchOpen);
      if (row) { navigate(row.module_type); void openRecord(row.id); }
      return;
    }
    if (target.dataset.clearImage) {
      const box = target.closest('.upload-box');
      $('[name]', box).value = '';
      $('[name]', box).setCustomValidity('');
      updateImagePreview(box, '');
      $('.upload-status', box).textContent = '已清除表单附件；Drive 文件不会被删除。';
      state.dirty = true;
      return;
    }
    const actions = {
      theme: toggleTheme, currency: toggleCurrency, rates: () => openRates(), export: exportExcel,
      new: () => openNew(), refresh: () => refresh(true), logout,
      'close-record': closeRecord, 'reload-record': reloadRecord, delete: askDelete,
      'confirm-delete': confirmDelete, 'cancel-delete': () => { if (!state.deleting) $('#delete-dialog').close(); },
      'close-rates': closeRates, 'reload-rates': reloadRates,
      drawer: () => $('#mobile-drawer').showModal(), 'close-drawer': () => $('#mobile-drawer').close()
    };
    if (actions[target.dataset.action]) void actions[target.dataset.action]();
  });
  $('#record-dialog').addEventListener('cancel', event => { event.preventDefault(); closeRecord(); });
  $('#rates-dialog').addEventListener('cancel', event => { event.preventDefault(); closeRates(); });
  $('#delete-dialog').addEventListener('cancel', event => { if (state.deleting) event.preventDefault(); });
  window.addEventListener('beforeunload', event => {
    if (state.dirty || state.ratesDirty || state.saving || state.uploading) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('hashchange', () => { if (state.authenticated) navigate(pageFromHash()); });
  window.addEventListener('focus', () => { if (state.authenticated) void refresh(); });
  window.addEventListener('online', () => { if (state.authenticated) void refresh(); else void connect(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.authenticated) void refresh(); });
  setInterval(() => { if (state.authenticated && !document.hidden && !state.saving && !state.deleting && !state.ratesBusy) void refresh(); }, 30000);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
  updateTheme();
  void connect();
})();
