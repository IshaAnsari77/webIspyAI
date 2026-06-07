'use strict';

/**
 * iSpyAI SDK — UI Controller
 * ─────────────────────────────────────────────────────────────────
 * Owns all DOM interactions:
 *   - Simulation triggers (single / burst)
 *   - Live log table rendering with enter animations
 *   - Stat cards (auto-update)
 *   - Filter pills + search
 *   - Detail slide-in panel with timeline, JSON highlighting
 *   - Toast notifications
 *   - Error badge counter
 *   - Clock
 * ─────────────────────────────────────────────────────────────────
 */
const UI = (function () {

  class UI {
    constructor () {
      this._lm             = null;   /* LogManager instance */
      this._ix             = null;   /* NetworkInterceptor instance */
      this._filter         = 'all';
      this._search         = '';
      this._selectedId     = null;
      this._burstRunning   = false;
      this._toastTimer     = null;
    }

    /* ════════════════════════════════════════════════════════════
       INIT
       ════════════════════════════════════════════════════════════ */

    init (logManager, interceptor) {
      this._lm = logManager;
      this._ix = interceptor;

      /* Subscribe to LogManager events */
      logManager
        .on('log-added',            e     => this._onLogAdded(e))
        .on('logs-cleared',         ()    => this._onLogsCleared())
        .on('error-count-changed',  count => this._updateErrorBadge(count));

      /* Subscribe to Interceptor lifecycle */
      interceptor
        .on('request-captured', req => this._onRequestCaptured(req));

      /* Boot UI */
      this._bindEvents();
      this._startClock();
      this._renderStats();
      this._updateLogCount(0);
    }

    /* ════════════════════════════════════════════════════════════
       EVENT BINDING
       ════════════════════════════════════════════════════════════ */

    _bindEvents () {
      /* Simulation buttons */
      this._qs('#btnSingleRequest').addEventListener('click', () => this._runSingle());
      this._qs('#btnBurstMode').addEventListener('click',     () => this._runBurst());
      this._qs('#btnClearLogs').addEventListener('click',     () => this._handleClear());

      /* Filter pills */
      this._qsa('.filter-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          this._qsa('.filter-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._filter = btn.dataset.filter;
          this._reRenderTable();
        });
      });

      /* Search */
      this._qs('#searchInput').addEventListener('input', e => {
        this._search = e.target.value.trim();
        this._reRenderTable();
      });

      /* Detail panel close */
      this._qs('#closeDetail').addEventListener('click', () => this._closeDetail());
      this._qs('#detailOverlay').addEventListener('click', () => this._closeDetail());
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeDetail(); });
    }

    /* ════════════════════════════════════════════════════════════
       SIMULATION TRIGGERS
       ════════════════════════════════════════════════════════════ */

    async _runSingle () {
      const btn = this._qs('#btnSingleRequest');
      this._setLoading(btn, true);
      try {
        await this._ix.intercept();
      } finally {
        this._setLoading(btn, false);
      }
    }

    async _runBurst () {
      if (this._burstRunning) return;
      this._burstRunning = true;

      const btn = this._qs('#btnBurstMode');
      this._setLoading(btn, true);
      this._toast('Burst mode — sending 5 simultaneous requests…');

      /* Stagger by 300 ms each so the table entries trickle in */
      const jobs = Array.from({ length: 5 }, (_, i) =>
        new Promise(resolve => {
          setTimeout(async () => {
            await this._ix.intercept();
            resolve();
          }, i * 300);
        })
      );

      await Promise.all(jobs);

      this._setLoading(btn, false);
      this._burstRunning = false;
    }

    _handleClear () {
      this._closeDetail();
      this._lm.clearLogs();
      this._toast('Logs cleared.');
    }

    /* ════════════════════════════════════════════════════════════
       LOG MANAGER CALLBACKS
       ════════════════════════════════════════════════════════════ */

    _onLogAdded (entry) {
      this._hideEmptyState();
      this._insertRow(entry);
      this._renderStats();
      this._updateReqCounter();
    }

    _onLogsCleared () {
      this._qs('#logTableBody').innerHTML = '';
      this._showEmptyState();
      this._renderStats();
      this._updateLogCount(0);
      this._updateReqCounter();
    }

    _onRequestCaptured (req) {
      /* Flash the interceptor status dot */
      const el = this._qs('#statusInterceptor');
      if (!el) return;
      el.classList.add('intercepting');
      setTimeout(() => el.classList.remove('intercepting'), 900);
    }

    /* ════════════════════════════════════════════════════════════
       STATS ROW
       ════════════════════════════════════════════════════════════ */

    _renderStats () {
      const s = this._lm.getStats();
      this._setStatVal('statTotal',   s.total);
      this._setStatVal('statSuccess', s.total > 0 ? s.successRate + '%' : '0%');
      this._setStatVal('statErrors',  s.errors);
      this._setStatVal('statAvgTime', s.total > 0 ? s.avgResponseTime + 'ms' : '0ms');
    }

    _setStatVal (id, value) {
      const el = this._qs('#' + id);
      if (!el) return;
      const str = String(value);
      if (el.textContent === str) return;
      el.textContent = str;
      el.classList.remove('flash');
      void el.offsetWidth;              /* reflow to restart animation */
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 500);
    }

    /* ════════════════════════════════════════════════════════════
       TABLE — INSERT & RE-RENDER
       ════════════════════════════════════════════════════════════ */

    _insertRow (entry) {
      if (!this._matchesView(entry)) return;

      const tbody = this._qs('#logTableBody');
      const row   = this._buildRow(entry);
      row.classList.add('new-entry');

      tbody.firstChild
        ? tbody.insertBefore(row, tbody.firstChild)
        : tbody.appendChild(row);

      this._updateLogCount();
    }

    _reRenderTable () {
      const tbody = this._qs('#logTableBody');
      tbody.innerHTML = '';

      const logs = this._getDisplayLogs();

      if (logs.length === 0) {
        const all = this._lm.getLogs();
        if (all.length === 0) {
          this._showEmptyState();
        } else {
          this._showEmptyState('No requests match the current filter / search.');
        }
        this._updateLogCount(0);
        return;
      }

      this._hideEmptyState();
      logs.forEach(entry => tbody.appendChild(this._buildRow(entry)));

      /* Re-apply selected row highlight */
      if (this._selectedId) {
        const row = this._qs('.log-row[data-id="' + this._selectedId + '"]');
        if (row) row.classList.add('selected');
      }

      this._updateLogCount(logs.length);
    }

    _buildRow (entry) {
      const tr = document.createElement('tr');
      tr.className   = 'log-row';
      tr.dataset.id  = entry.id;

      const rtClass = entry.responseTime > 1500 ? 'slow'
                    : entry.responseTime > 500  ? 'medium'
                    : 'fast';
      const rtWidth = Math.min(100, Math.round((entry.responseTime / 2500) * 100));
      const sCls    = this._statusClass(entry.status);

      tr.innerHTML = `
        <td><span class="method-badge method-${this._esc(entry.method.toLowerCase())}">${this._esc(entry.method)}</span></td>
        <td class="endpoint-cell">
          <div class="endpoint-name">${this._esc(entry.name || '')}</div>
          <div class="endpoint-url">${this._esc(entry.endpoint)}</div>
        </td>
        <td>
          <span class="status-badge status-${sCls}">
            <span class="status-dot-sm"></span>
            ${entry.status}&nbsp;${this._esc(entry.statusText)}
          </span>
        </td>
        <td>
          <div class="response-time ${rtClass}">
            <div class="rt-bar-wrapper"><div class="rt-bar" style="width:${rtWidth}%"></div></div>
            <span>${entry.responseTime}ms</span>
          </div>
        </td>
        <td>
          <div class="ai-insight-cell ${this._esc(entry.aiInsight.severity)}">
            <span class="ai-icon">${entry.aiInsight.icon}</span>
            <span>${this._esc(entry.aiInsight.title)}</span>
          </div>
        </td>
        <td class="timestamp-cell">${this._fmtTime(entry.timestamp)}</td>
      `;

      tr.addEventListener('click', () => this._showDetail(entry.id));
      return tr;
    }

    _getDisplayLogs () {
      let logs = this._filter !== 'all'
        ? this._lm.getLogs(this._filter)
        : this._lm.getLogs();

      if (this._search) {
        const searched = this._lm.searchLogs(this._search);
        if (this._filter !== 'all') {
          logs = searched.filter(l => l.category === this._filter);
        } else {
          logs = searched;
        }
      }

      return logs;
    }

    _matchesView (entry) {
      if (this._filter !== 'all' && entry.category !== this._filter) return false;
      if (!this._search) return true;
      const q = this._search.toLowerCase();
      return (
        entry.endpoint.toLowerCase().includes(q) ||
        entry.method.toLowerCase().includes(q)   ||
        String(entry.status).includes(q)          ||
        (entry.name || '').toLowerCase().includes(q)
      );
    }

    /* ════════════════════════════════════════════════════════════
       DETAIL PANEL
       ════════════════════════════════════════════════════════════ */

    _showDetail (logId) {
      const entry = this._lm.getLog(logId);
      if (!entry) return;

      this._selectedId = logId;

      /* Highlight row */
      this._qsa('.log-row').forEach(r => r.classList.remove('selected'));
      const row = this._qs('.log-row[data-id="' + logId + '"]');
      if (row) row.classList.add('selected');

      /* Populate header */
      const badge = this._qs('#detailStatusBadge');
      badge.className   = 'status-badge status-' + this._statusClass(entry.status);
      badge.innerHTML   = '<span class="status-dot-sm"></span>' + entry.status + '&nbsp;' + this._esc(entry.statusText);

      this._qs('#detailEndpointText').textContent = entry.method + ' ' + entry.endpoint;

      /* Populate body */
      this._qs('#detailPanelBody').innerHTML = this._buildDetailHTML(entry);

      /* Open */
      this._qs('#detailPanel').classList.add('open');
      this._qs('#detailOverlay').classList.add('open');
    }

    _closeDetail () {
      this._qs('#detailPanel').classList.remove('open');
      this._qs('#detailOverlay').classList.remove('open');
      this._qsa('.log-row').forEach(r => r.classList.remove('selected'));
      this._selectedId = null;
    }

    _buildDetailHTML (entry) {
      const rtClass = entry.responseTime > 1500 ? 'slow'
                    : entry.responseTime > 500  ? 'medium'
                    : 'fast';

      /* Timeline approximate timestamps */
      const tCapture = 0;
      const tTransit = Math.round(entry.responseTime * 0.12);
      const tRecv    = Math.round(entry.responseTime * 0.88);
      const tAI      = entry.responseTime + 2;

      const reqBodyHTML  = entry.body
        ? `<div class="subsection-label">Request Body <span class="privacy-tag">🔒 Privacy Masked</span></div>
           <div class="json-container"><pre class="json-block">${this._highlight(entry.body)}</pre></div>`
        : '';

      return `
        <!-- AI Analysis -->
        <div class="detail-section ai-section ${this._esc(entry.aiInsight.severity)}">
          <div class="section-label">AI ANALYSIS</div>
          <div class="ai-header">
            <span class="ai-big-icon">${entry.aiInsight.icon}</span>
            <div class="ai-title-wrap">
              <div class="ai-title">${this._esc(entry.aiInsight.title)}</div>
              <div class="ai-severity">Severity: ${entry.aiInsight.severity.toUpperCase()}</div>
            </div>
          </div>
          <div class="ai-detail">${this._esc(entry.aiInsight.detail)}</div>
        </div>

        <!-- Timeline -->
        <div class="detail-section">
          <div class="section-label">REQUEST LIFECYCLE</div>
          <div class="timeline">
            <div class="timeline-item completed">
              <div class="tl-dot"></div>
              <div class="tl-content">
                <div class="tl-title">Request Captured</div>
                <div class="tl-desc">NetworkInterceptor hooked outbound call before network dispatch</div>
              </div>
              <div class="tl-time">+${tCapture}ms</div>
            </div>
            <div class="timeline-item completed">
              <div class="tl-dot"></div>
              <div class="tl-content">
                <div class="tl-title">Network Transit</div>
                <div class="tl-desc">Request dispatched to server — TLS handshake + transfer</div>
              </div>
              <div class="tl-time">+${tTransit}ms</div>
            </div>
            <div class="timeline-item completed">
              <div class="tl-dot"></div>
              <div class="tl-content">
                <div class="tl-title">Response Received</div>
                <div class="tl-desc">HTTP ${entry.status} ${this._esc(entry.statusText)} — body decoded</div>
              </div>
              <div class="tl-time">+${tRecv}ms</div>
            </div>
            <div class="timeline-item completed">
              <div class="tl-dot"></div>
              <div class="tl-content">
                <div class="tl-title">AI Analysis Complete</div>
                <div class="tl-desc">LogManager: privacy-masking applied, AI insight generated</div>
              </div>
              <div class="tl-time">+${tAI}ms</div>
            </div>
          </div>
        </div>

        <!-- Request -->
        <div class="detail-section">
          <div class="section-label">REQUEST</div>
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-key">Method</span>
              <span class="method-badge method-${this._esc(entry.method.toLowerCase())}">${this._esc(entry.method)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-key">Endpoint</span>
              <code class="meta-value">${this._esc(entry.endpoint)}</code>
            </div>
            <div class="meta-item">
              <span class="meta-key">Request ID</span>
              <code class="meta-value">${this._esc(entry.id)}</code>
            </div>
            <div class="meta-item">
              <span class="meta-key">Timestamp</span>
              <code class="meta-value">${new Date(entry.timestamp).toLocaleString()}</code>
            </div>
          </div>

          <div class="subsection-label">Request Headers <span class="privacy-tag">🔒 Privacy Masked</span></div>
          <div class="json-container"><pre class="json-block">${this._highlight(entry.headers)}</pre></div>

          ${reqBodyHTML}
        </div>

        <!-- Response -->
        <div class="detail-section">
          <div class="section-label">RESPONSE</div>
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-key">Status</span>
              <span class="status-badge status-${this._statusClass(entry.status)}">
                <span class="status-dot-sm"></span>
                ${entry.status}&nbsp;${this._esc(entry.statusText)}
              </span>
            </div>
            <div class="meta-item">
              <span class="meta-key">Response Time</span>
              <span class="meta-value ${rtClass === 'slow' ? 'slow-warn' : ''}">
                ${entry.responseTime}ms${entry.responseTime > 1500 ? ' &nbsp;⚠️ Slow' : ''}
              </span>
            </div>
          </div>

          <div class="subsection-label">Response Headers</div>
          <div class="json-container"><pre class="json-block">${this._highlight(entry.responseHeaders)}</pre></div>

          <div class="subsection-label">Response Body</div>
          <div class="json-container"><pre class="json-block">${this._highlight(entry.responseBody)}</pre></div>
        </div>
      `;
    }

    /* ════════════════════════════════════════════════════════════
       HELPERS
       ════════════════════════════════════════════════════════════ */

    /** JSON syntax highlighter with HTML escaping and masked-value coloring */
    _highlight (obj) {
      if (obj == null) return '<span class="json-null">null</span>';
      const json    = JSON.stringify(obj, null, 2);
      const escaped = json
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return escaped.replace(
        /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        match => {
          /* Key */
          if (/^"/.test(match) && /:$/.test(match)) {
            return '<span class="json-key">' + match + '</span>';
          }
          /* Masked value */
          if (match === '"*****"') {
            return '<span class="json-masked">"*****"</span>';
          }
          /* String value */
          if (/^"/.test(match)) {
            return '<span class="json-string">' + match + '</span>';
          }
          /* Boolean */
          if (/^true$|^false$/.test(match)) {
            return '<span class="json-boolean">' + match + '</span>';
          }
          /* Null */
          if (match === 'null') {
            return '<span class="json-null">null</span>';
          }
          /* Number */
          return '<span class="json-number">' + match + '</span>';
        }
      );
    }

    _statusClass (status) {
      if (status >= 500) return 'error';
      if (status >= 400) return 'warning';
      return 'success';
    }

    _fmtTime (isoStr) {
      return new Date(isoStr).toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }

    /** Safe HTML escaping for user-influenced strings */
    _esc (str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    _setLoading (btn, on) {
      if (on) { btn.classList.add('loading');    btn.disabled = true;  }
      else    { btn.classList.remove('loading'); btn.disabled = false; }
    }

    _updateErrorBadge (count) {
      const badge = this._qs('#errorBadge');
      if (!badge) return;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
        badge.classList.add('pulse');
        setTimeout(() => badge.classList.remove('pulse'), 400);
      } else {
        badge.classList.add('hidden');
      }
    }

    _updateLogCount (override) {
      const el = this._qs('#logCount');
      if (!el) return;
      const n = override !== undefined ? override : this._getDisplayLogs().length;
      el.textContent = n + (n === 1 ? ' request' : ' requests');
    }

    _updateReqCounter () {
      const el = this._qs('#reqCounterVal');
      if (el) el.textContent = String(this._lm.getStats().total);
    }

    _showEmptyState (msg) {
      const el  = this._qs('#emptyState');
      const sub = this._qs('#emptySubtitle');
      if (!el) return;
      el.style.display = 'flex';
      if (sub && msg) {
        sub.innerHTML = this._esc(msg);
      } else if (sub && !msg) {
        sub.innerHTML = 'Click <strong>"Simulate API Call"</strong> to start monitoring live traffic';
      }
    }

    _hideEmptyState () {
      const el = this._qs('#emptyState');
      if (el) el.style.display = 'none';
    }

    _startClock () {
      const tick = () => {
        const el = this._qs('#currentTime');
        if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
      };
      tick();
      setInterval(tick, 1000);
    }

    /* ── Toast notification ──────────────────────────────────── */
    _toast (msg) {
      const el = this._qs('#toast');
      if (!el) return;
      if (this._toastTimer) clearTimeout(this._toastTimer);
      el.textContent = msg;
      el.classList.add('show');
      this._toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
    }

    /* ── DOM shortcuts ───────────────────────────────────────── */
    _qs  (sel) { return document.querySelector(sel); }
    _qsa (sel) { return document.querySelectorAll(sel); }
  }

  return UI;
}());
