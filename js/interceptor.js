'use strict';

/**
 * iSpyAI SDK — NetworkInterceptor
 * ─────────────────────────────────────────────────────────────────
 * Simulates the iOS SDK's network interception layer.
 *
 * In a real iOS SDK this module wraps URLSession / Alamofire,
 * attaching request/response hooks before any data is sent.
 *
 * Architecture:
 *   intercept()
 *     → emits "request-captured"   (before network)
 *     → simulates network transit  (weighted-random scenario)
 *     → emits "response-received"  (after network)
 * ─────────────────────────────────────────────────────────────────
 */
const NetworkInterceptor = (function () {

  /* ── Helpers ─────────────────────────────────────────────────── */
  const rand = (max) => Math.random() * max;
  const uid  = ()    => Math.random().toString(36).substr(2, 8);

  /* ── API Definitions ─────────────────────────────────────────── */
  /*
   * Each entry simulates a real mobile app endpoint.
   * `scenarios` are weighted: higher weight = more likely to be picked.
   * `delay` is a function so it's freshly computed per request.
   */
  const API_DEFINITIONS = [
    /* ──────────────────────────────────────────────────────────── */
    {
      name: 'Fetch User Profile',
      method: 'GET',
      endpoint: '/api/v1/users/me',
      headers: {
        'Authorization':  'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiVVNSXzg4MTIiLCJleHAiOjE3OTgzMDAwMDB9.xK8mNqP3rT',
        'Content-Type':   'application/json',
        'X-App-Version':  '2.1.0',
        'X-Device-ID':    'iPhone15-Pro-A2B3C4D5E6',
        'X-Platform':     'iOS',
        'X-SDK-Version':  'iSpyAI/2.1.0'
      },
      scenarios: [
        {
          weight: 5, status: 200,
          delay: () => 140 + rand(240),
          body: {
            id: 'USR_8812', name: 'Alex Johnson',
            email: 'alex.johnson@example.com', plan: 'premium',
            avatar_url: 'https://cdn.example.com/avatars/USR_8812.jpg',
            created_at: '2024-03-15T10:30:00Z',
            last_login: new Date().toISOString(),
            preferences: { theme: 'dark', notifications: true, language: 'en-US' }
          }
        },
        {
          weight: 2, status: 401,
          delay: () => 75 + rand(50),
          body: {
            error: 'UNAUTHORIZED',
            message: 'Access token has expired',
            code: 'TOKEN_EXPIRED',
            expires_at: '2026-06-01T00:00:00Z'
          }
        },
        {
          weight: 1, status: 500,
          delay: () => 280 + rand(200),
          body: {
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred on the server',
            request_id: 'REQ_' + uid(),
            trace_id: 'TRC_' + uid()
          }
        },
        {
          /* Slow response — triggers "Performance Issue" insight */
          weight: 1, status: 200,
          delay: () => 1850 + rand(900),
          body: {
            id: 'USR_8812', name: 'Alex Johnson',
            email: 'alex.johnson@example.com', plan: 'premium',
            _debug: 'slow_db_query_simulated'
          }
        }
      ]
    },

    /* ──────────────────────────────────────────────────────────── */
    {
      name: 'POST Login',
      method: 'POST',
      endpoint: '/api/v1/auth/login',
      headers: {
        'Content-Type':  'application/json',
        'X-App-Version': '2.1.0',
        'X-Device-ID':   'iPhone15-Pro-A2B3C4D5E6',
        'X-Platform':    'iOS'
      },
      body: {
        email:        'alex.johnson@example.com',
        password:     'myS3cur3P@ssw0rd!',
        device_token: 'FCM_TOKEN_abc123def456ghi789'
      },
      scenarios: [
        {
          weight: 4, status: 200,
          delay: () => 200 + rand(400),
          body: {
            access_token:  'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiVVNSXzg4MTIifQ.n3wT0k3n',
            refresh_token: 'ref_' + uid() + '_' + uid(),
            token_type:    'Bearer',
            expires_in:    3600,
            user: { id: 'USR_8812', name: 'Alex Johnson', email: 'alex.johnson@example.com' }
          }
        },
        {
          weight: 3, status: 401,
          delay: () => 140 + rand(60),
          body: {
            error:              'INVALID_CREDENTIALS',
            message:            'Email or password is incorrect',
            attempts_remaining: 4
          }
        },
        {
          weight: 1, status: 403,
          delay: () => 115 + rand(35),
          body: {
            error:     'ACCOUNT_LOCKED',
            message:   'Account temporarily locked due to too many failed attempts',
            unlock_at: '2026-06-08T02:00:00Z'
          }
        },
        {
          weight: 1, status: 500,
          delay: () => 500 + rand(250),
          body: {
            error:       'AUTH_SERVICE_UNAVAILABLE',
            message:     'Authentication service is temporarily unavailable',
            retry_after: 30
          }
        }
      ]
    },

    /* ──────────────────────────────────────────────────────────── */
    {
      name: 'GET Products',
      method: 'GET',
      endpoint: '/api/v1/products?page=1&limit=20',
      headers: {
        'Authorization':   'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiVVNSXzg4MTIifQ.tok3n',
        'Content-Type':    'application/json',
        'X-App-Version':   '2.1.0',
        'Accept-Language': 'en-US',
        'X-Platform':      'iOS'
      },
      scenarios: [
        {
          weight: 5, status: 200,
          delay: () => 190 + rand(310),
          body: {
            products: [
              { id: 'PRD_001', name: 'Starter',    price: 9.99,   currency: 'USD', available: true  },
              { id: 'PRD_002', name: 'Premium',    price: 29.99,  currency: 'USD', available: true  },
              { id: 'PRD_003', name: 'Enterprise', price: 299.99, currency: 'USD', available: false }
            ],
            total: 3, page: 1, limit: 20
          }
        },
        {
          /* Slow DB fetch */
          weight: 2, status: 200,
          delay: () => 2100 + rand(950),
          body: { products: [], total: 0, _debug: 'catalog_cache_miss_full_scan' }
        },
        {
          weight: 1, status: 500,
          delay: () => 580 + rand(220),
          body: {
            error: 'DATABASE_ERROR',
            message: 'Failed to retrieve product catalog',
            code: 'DB_CONN_TIMEOUT'
          }
        }
      ]
    },

    /* ──────────────────────────────────────────────────────────── */
    {
      name: 'GET Admin Analytics',
      method: 'GET',
      endpoint: '/api/v1/admin/analytics/dashboard',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiVVNSXzg4MTIifQ.tok3n',
        'Content-Type':  'application/json',
        'X-App-Version': '2.1.0',
        'X-Platform':    'iOS'
      },
      scenarios: [
        {
          /* 403 most likely — user is not ADMIN */
          weight: 4, status: 403,
          delay: () => 95 + rand(60),
          body: {
            error:         'FORBIDDEN',
            message:       'Insufficient permissions to access admin resources',
            required_role: 'ADMIN',
            current_role:  'USER'
          }
        },
        {
          weight: 2, status: 200,
          delay: () => 310 + rand(200),
          body: {
            total_users: 15420, active_today: 3241,
            revenue_mtd: 48920.50,
            alerts: [], generated_at: new Date().toISOString()
          }
        },
        {
          weight: 1, status: 401,
          delay: () => 88 + rand(40),
          body: {
            error: 'UNAUTHORIZED',
            message: 'Admin endpoints require an elevated authentication token'
          }
        }
      ]
    },

    /* ──────────────────────────────────────────────────────────── */
    {
      name: 'GET Order Detail',
      method: 'GET',
      endpoint: '/api/v1/orders/ORD_45891',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiVVNSXzg4MTIifQ.tok3n',
        'Content-Type':  'application/json',
        'X-App-Version': '2.1.0',
        'X-Platform':    'iOS'
      },
      scenarios: [
        {
          weight: 4, status: 404,
          delay: () => 115 + rand(80),
          body: {
            error:    'NOT_FOUND',
            message:  'Order ORD_45891 does not exist or has been removed',
            resource: 'Order',
            id:       'ORD_45891',
            suggestions: ['Check the order ID', 'Verify the order belongs to this account']
          }
        },
        {
          weight: 2, status: 200,
          delay: () => 205 + rand(160),
          body: {
            id: 'ORD_45891', status: 'delivered',
            items: 3, total: 149.99, currency: 'USD',
            created_at: '2026-05-20T14:00:00Z',
            delivered_at: '2026-05-23T10:15:00Z'
          }
        },
        {
          weight: 1, status: 500,
          delay: () => 420 + rand(200),
          body: {
            error:   'ORDER_SERVICE_ERROR',
            message: 'Order service encountered an unexpected error',
            trace_id: 'TRC_' + uid()
          }
        }
      ]
    },

    /* ──────────────────────────────────────────────────────────── */
    {
      name: 'POST Upload Image',
      method: 'POST',
      endpoint: '/api/v1/uploads/profile-image',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiVVNSXzg4MTIifQ.tok3n',
        'Content-Type':  'multipart/form-data; boundary=----iSpyBoundary7F3A9',
        'X-App-Version': '2.1.0',
        'X-Platform':    'iOS'
      },
      scenarios: [
        {
          weight: 3, status: 200,
          delay: () => 820 + rand(420),
          body: {
            success: true,
            url: 'https://cdn.example.com/avatars/USR_8812_v3.jpg',
            size_bytes: 245120,
            dimensions: { width: 512, height: 512 },
            cdn_id: uid()
          }
        },
        {
          /* Large file — slow upload */
          weight: 2, status: 200,
          delay: () => 2200 + rand(900),
          body: {
            success: true,
            url: 'https://cdn.example.com/avatars/USR_8812_v3.jpg',
            _debug: 'slow_upload_cdn_replication'
          }
        },
        {
          weight: 2, status: 500,
          delay: () => 390 + rand(210),
          body: {
            error:       'UPLOAD_FAILED',
            message:     'Storage service is currently unavailable',
            retry_after: 30
          }
        }
      ]
    },

    /* ──────────────────────────────────────────────────────────── */
    {
      name: 'GET Notifications',
      method: 'GET',
      endpoint: '/api/v1/users/me/notifications?unread=true',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiVVNSXzg4MTIifQ.tok3n',
        'Content-Type':  'application/json',
        'X-App-Version': '2.1.0',
        'X-Platform':    'iOS'
      },
      scenarios: [
        {
          weight: 5, status: 200,
          delay: () => 120 + rand(200),
          body: {
            notifications: [
              { id: 'NTF_001', type: 'order_update',  title: 'Order shipped',          read: false, created_at: '2026-06-07T18:00:00Z' },
              { id: 'NTF_002', type: 'promo',         title: '30% off — this weekend', read: false, created_at: '2026-06-07T10:00:00Z' }
            ],
            unread_count: 2
          }
        },
        {
          weight: 1, status: 401,
          delay: () => 85 + rand(40),
          body: { error: 'UNAUTHORIZED', message: 'Session expired. Please log in again.' }
        },
        {
          weight: 1, status: 500,
          delay: () => 350 + rand(200),
          body: { error: 'NOTIFICATION_SERVICE_DOWN', message: 'Push notification service unavailable' }
        }
      ]
    }
  ];

  /* ── NetworkInterceptor class ────────────────────────────────── */
  class NetworkInterceptor {
    constructor () {
      this.isActive   = true;
      this._listeners = {};
    }

    /** Subscribe to lifecycle events. Returns `this` for chaining. */
    on (event, callback) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(callback);
      return this;
    }

    _emit (event, data) {
      (this._listeners[event] || []).forEach(fn => fn(data));
    }

    /**
     * Main intercept method — simulates a full request lifecycle.
     *
     * Phase 1: Capture request  → fires "request-captured"
     * Phase 2: Simulate delay   → mimics network transit
     * Phase 3: Build response   → fires "response-received"
     */
    async intercept () {
      if (!this.isActive) return null;

      /* Pick a random API definition */
      const def = API_DEFINITIONS[Math.floor(Math.random() * API_DEFINITIONS.length)];
      const requestId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);

      /* ── Phase 1: Capture request ──────────────────────────── */
      const capturedRequest = {
        id:          requestId,
        name:        def.name,
        method:      def.method,
        endpoint:    def.endpoint,
        headers:     Object.assign({}, def.headers),
        body:        def.body ? Object.assign({}, def.body) : null,
        capturedAt:  Date.now()
      };

      this._emit('request-captured', capturedRequest);

      /* ── Phase 2: Simulate network ─────────────────────────── */
      const scenario = this._pickScenario(def.scenarios);
      const delayMs  = Math.round(typeof scenario.delay === 'function' ? scenario.delay() : scenario.delay);

      const t0 = performance.now();
      await this._sleep(delayMs);
      const responseTime = Math.round(performance.now() - t0);

      /* ── Phase 3: Build log entry ──────────────────────────── */
      const logEntry = Object.assign({}, capturedRequest, {
        status:          scenario.status,
        statusText:      this._statusText(scenario.status),
        responseHeaders: {
          'Content-Type':           'application/json; charset=utf-8',
          'X-Request-ID':           requestId,
          'X-Response-Time':        responseTime + 'ms',
          'Cache-Control':          'no-cache, no-store, must-revalidate',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'X-RateLimit-Remaining':  String(Math.floor(rand(950) + 50)),
          'X-RateLimit-Reset':      String(Math.floor(Date.now() / 1000) + 3600),
          'X-SDK-Intercepted':      'true'
        },
        responseBody:    Object.assign({}, scenario.body),
        responseTime:    responseTime,
        timestamp:       new Date().toISOString(),
        category:        this._categorize(scenario.status, responseTime)
      });

      this._emit('response-received', logEntry);
      return logEntry;
    }

    /* ── Private helpers ─────────────────────────────────────── */

    _pickScenario (scenarios) {
      const total = scenarios.reduce((s, x) => s + (x.weight || 1), 0);
      let r = Math.random() * total;
      for (const s of scenarios) {
        r -= (s.weight || 1);
        if (r <= 0) return s;
      }
      return scenarios[scenarios.length - 1];
    }

    _sleep (ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    _statusText (code) {
      return ({
        200: 'OK', 201: 'Created', 204: 'No Content',
        400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
        404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
      })[code] || 'Unknown';
    }

    _categorize (status, responseTime) {
      if (status >= 500) return 'server-error';
      if (status >= 400) return 'client-error';
      if (responseTime > 1500) return 'slow';
      return 'success';
    }

    setActive (active) {
      this.isActive = !!active;
    }
  }

  return NetworkInterceptor;
}());
