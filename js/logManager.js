'use strict';

/**
 * iSpyAI SDK — LogManager
 * ─────────────────────────────────────────────────────────────────
 * Responsible for:
 *   1. Storing log entries in memory (in production: SQLite + cloud)
 *   2. Privacy masking — Authorization, tokens, passwords → "*****"
 *   3. AI Analysis — maps HTTP status / performance to human insights
 *   4. Querying — filter by category, full-text search, stats
 * ─────────────────────────────────────────────────────────────────
 */
const LogManager = (function () {

  /* ── Sensitive field definitions ─────────────────────────────── */
  /*
   * These mirror what the iOS SDK strips before uploading to the
   * iSpyAI cloud dashboard in production.
   */
  const SENSITIVE_HEADERS = new Set([
    'authorization',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
    'x-secret-key',
    'cookie',
    'set-cookie',
    'proxy-authorization'
  ]);

  const SENSITIVE_BODY_KEYS = new Set([
    'password',
    'pass',
    'passwd',
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'secret',
    'api_key',
    'apikey',
    'card_number',
    'cvv',
    'ssn',
    'social_security',
    'credit_card',
    'private_key',
    'device_token'
  ]);

  const MASK = '*****';

  /* ── AI Analysis rules ───────────────────────────────────────── */
  /*
   * Rules are evaluated top-to-bottom; first match wins.
   * In production the AI engine runs on-device (Core ML) and in cloud.
   */
  const AI_RULES = [
    {
      test: e => e.status === 401,
      severity: 'warning',
      title: 'Authentication Issue',
      icon: '🔐',
      detail: e =>
        `Request to ${e.endpoint} was rejected with 401 Unauthorized. ` +
        `The access token is likely expired or revoked. ` +
        `Implement silent token refresh (refresh_token grant) to recover automatically.`
    },
    {
      test: e => e.status === 403,
      severity: 'warning',
      title: 'Authorization Failure',
      icon: '🚫',
      detail: e =>
        `Access to ${e.endpoint} was denied — 403 Forbidden. ` +
        `The authenticated user lacks the required role or permission. ` +
        `Review RBAC configuration and ensure the token contains correct scopes.`
    },
    {
      test: e => e.status === 404,
      severity: 'info',
      title: 'Resource Not Found',
      icon: '🔍',
      detail: e =>
        `The endpoint ${e.endpoint} returned 404 Not Found. ` +
        `Possible causes: incorrect resource ID, deleted record, or wrong environment URL. ` +
        `Verify the request parameters against the API contract.`
    },
    {
      test: e => e.status === 429,
      severity: 'warning',
      title: 'Rate Limit Exceeded',
      icon: '⏱️',
      detail: e =>
        `${e.endpoint} returned 429 Too Many Requests. ` +
        `The client is sending requests too frequently. ` +
        `Implement exponential back-off and respect Retry-After headers.`
    },
    {
      test: e => e.status >= 500,
      severity: 'critical',
      title: 'Server Error Detected',
      icon: '🔥',
      detail: e =>
        `Server returned ${e.status} ${e.statusText} on ${e.endpoint}. ` +
        `This indicates a backend failure — possible causes: unhandled exception, ` +
        `database timeout, or downstream service outage. ` +
        `Check server logs and alert the on-call engineer.`
    },
    {
      test: e => e.category === 'slow' && e.status < 400,
      severity: 'warning',
      title: 'Performance Issue',
      icon: '⚡',
      detail: e =>
        `Response time of ${e.responseTime}ms exceeds the 1500ms threshold for ${e.endpoint}. ` +
        `Users on slow networks will experience noticeable lag. ` +
        `Consider server-side caching, database query optimization, or pagination.`
    },
    {
      test: e => e.status >= 200 && e.status < 300,
      severity: 'success',
      title: 'Request Successful',
      icon: '✅',
      detail: e =>
        `${e.method} ${e.endpoint} completed in ${e.responseTime}ms — ` +
        `${e.status} ${e.statusText}. All systems nominal.`
    }
  ];

  /* ── LogManager class ────────────────────────────────────────── */
  class LogManager {
    constructor () {
      this._logs         = [];   /* Newest-first */
      this._listeners    = {};
      this._errorCount   = 0;    /* Non-2xx counter shown in badge */
    }

    /* ── Event bus ─────────────────────────────────────────────── */

    on (event, callback) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(callback);
      return this;
    }

    _emit (event, data) {
      (this._listeners[event] || []).forEach(fn => fn(data));
    }

    /* ── Public API ────────────────────────────────────────────── */

    /**
     * Process and store a raw interceptor entry.
     * Applies privacy masking, then AI analysis.
     * Emits "log-added".
     */
    addLog (rawEntry) {
      /* Deep-copy so we don't mutate the interceptor's object */
      const entry = this._deepClone(rawEntry);

      /* 1. Privacy masking */
      this._maskSensitiveData(entry);

      /* 2. AI analysis */
      entry.aiInsight = this._analyzeWithAI(entry);

      /* 3. Timestamp of storage */
      entry._storedAt = Date.now();

      /* 4. Persist */
      this._logs.unshift(entry);

      /* 5. Update error badge counter */
      if (entry.category !== 'success') {
        this._errorCount++;
        this._emit('error-count-changed', this._errorCount);
      }

      this._emit('log-added', entry);
      return entry;
    }

    /**
     * Return all logs, optionally filtered by category.
     * category: 'all' | 'success' | 'client-error' | 'server-error' | 'slow'
     */
    getLogs (category) {
      if (!category || category === 'all') return this._logs.slice();
      return this._logs.filter(l => l.category === category);
    }

    /** Return a single log by ID or null */
    getLog (id) {
      return this._logs.find(l => l.id === id) || null;
    }

    /** Full-text search across endpoint, method, status, name */
    searchLogs (query) {
      if (!query) return this._logs.slice();
      const q = query.toLowerCase();
      return this._logs.filter(l =>
        l.endpoint.toLowerCase().includes(q)   ||
        l.method.toLowerCase().includes(q)     ||
        String(l.status).includes(q)           ||
        (l.name || '').toLowerCase().includes(q)
      );
    }

    /** Delete all stored logs and reset counters */
    clearLogs () {
      this._logs       = [];
      this._errorCount = 0;
      this._emit('logs-cleared', null);
      this._emit('error-count-changed', 0);
    }

    /**
     * Aggregate statistics for the stats row in the UI.
     */
    getStats () {
      const total = this._logs.length;
      if (total === 0) {
        return { total: 0, successRate: 0, errors: 0, avgResponseTime: 0, slowCount: 0 };
      }

      const successes = this._logs.filter(l => l.status >= 200 && l.status < 300).length;
      const errors    = this._logs.filter(l => l.status >= 400 || l.status === 0).length;
      const slow      = this._logs.filter(l => l.category === 'slow').length;
      const totalTime = this._logs.reduce((s, l) => s + (l.responseTime || 0), 0);

      return {
        total,
        successRate:     Math.round((successes / total) * 100),
        errors,
        slowCount:       slow,
        avgResponseTime: Math.round(totalTime / total)
      };
    }

    /* ── Privacy Masking ───────────────────────────────────────── */

    _maskSensitiveData (entry) {
      if (entry.headers)         entry.headers         = this._maskHeaders(entry.headers);
      if (entry.responseHeaders) entry.responseHeaders = this._maskHeaders(entry.responseHeaders);
      if (entry.body && typeof entry.body === 'object') {
        entry.body = this._maskBodyFields(entry.body);
      }
      if (entry.responseBody && typeof entry.responseBody === 'object') {
        entry.responseBody = this._maskBodyFields(entry.responseBody);
      }
    }

    _maskHeaders (headers) {
      const out = {};
      for (const [k, v] of Object.entries(headers)) {
        out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? MASK : v;
      }
      return out;
    }

    _maskBodyFields (body) {
      const out = Object.assign({}, body);
      for (const key of Object.keys(out)) {
        if (SENSITIVE_BODY_KEYS.has(key.toLowerCase())) {
          out[key] = MASK;
        }
      }
      return out;
    }

    /* ── AI Analysis ───────────────────────────────────────────── */

    _analyzeWithAI (entry) {
      for (const rule of AI_RULES) {
        if (rule.test(entry)) {
          return {
            severity: rule.severity,
            title:    rule.title,
            icon:     rule.icon,
            detail:   typeof rule.detail === 'function' ? rule.detail(entry) : rule.detail
          };
        }
      }
      return {
        severity: 'info',
        title:    'No Classification',
        icon:     'ℹ️',
        detail:   `Request to ${entry.endpoint} completed but could not be classified.`
      };
    }

    /* ── Util ──────────────────────────────────────────────────── */

    _deepClone (obj) {
      try { return JSON.parse(JSON.stringify(obj)); }
      catch (_) { return Object.assign({}, obj); }
    }
  }

  return LogManager;
}());
