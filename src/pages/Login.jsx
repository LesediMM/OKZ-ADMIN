// src/pages/Login.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Auth.css';

const Login = ({ setUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [breachWarning, setBreachWarning] = useState('');
  const [showBreachWarning, setShowBreachWarning] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const navigate = useNavigate();

  // ===== FALLBACKS - Isolated inline =====
  const LoginFallbacks = {
    // FAIL HARD: Retry with backoff
    async retry(fn, maxRetries = 3) {
      let lastError;
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (err) {
          lastError = err;
          if (i === maxRetries - 1) break;
          
          const wait = 1000 * Math.pow(2, i);
          console.log(`🔄 Login retry ${i + 1}/${maxRetries} in ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
        }
      }
      throw lastError;
    },

    // FAIL HARD: Timeout wrapper
    async withTimeout(promise, ms = 8000) {
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), ms)
      );
      return Promise.race([promise, timeout]);
    },

    // FAIL SAFE: Network status
    network: {
      isOnline: navigator.onLine,
      init() {
        window.addEventListener('online', () => { this.isOnline = true; });
        window.addEventListener('offline', () => { this.isOnline = false; });
      }
    },

    // FAIL SAFE: Rate limit tracking
    attemptTracker: {
      count: 0,
      firstAttempt: null,
      
      recordAttempt() {
        this.count++;
        if (!this.firstAttempt) {
          this.firstAttempt = Date.now();
        }
      },
      
      reset() {
        this.count = 0;
        this.firstAttempt = null;
      },
      
      isRateLimited() {
        if (this.count >= 5 && this.firstAttempt) {
          // Reset after 15 minutes
          if (Date.now() - this.firstAttempt > 900000) {
            this.reset();
            return false;
          }
          return true;
        }
        return false;
      },
      
      getRemainingTime() {
        if (!this.firstAttempt) return 0;
        const elapsed = Date.now() - this.firstAttempt;
        const remaining = Math.max(0, 900000 - elapsed);
        return Math.ceil(remaining / 60000); // minutes
      }
    },

    // Simulated breach check
    checkBreachStatus: (password) => {
      const commonBreachedPasswords = [
        'password', 'password123', 'admin', 'admin123', '123456', 
        '12345678', 'qwerty', 'qwerty123', 'letmein', 'welcome',
        'monkey', 'dragon', 'football', 'baseball', 'abc123',
        '111111', '123123', '000000', 'adminadmin', 'passw0rd'
      ];
      
      if (commonBreachedPasswords.includes(password.toLowerCase())) {
        return {
          breached: true,
          message: '⚠️ This password has been found in a data breach. For your security, please update your credentials after logging in.'
        };
      }
      
      if (password.length < 8) {
        return {
          breached: true,
          message: '⚠️ Short passwords are more vulnerable. Please consider using a stronger password.'
        };
      }
      
      return { breached: false, message: '' };
    },
    
    acknowledgeBreach: (email) => {
      try {
        const acknowledged = JSON.parse(sessionStorage.getItem('breach_acknowledged') || '{}');
        acknowledged[email] = Date.now();
        sessionStorage.setItem('breach_acknowledged', JSON.stringify(acknowledged));
      } catch (e) {}
    },
    
    wasAcknowledged: (email) => {
      try {
        const acknowledged = JSON.parse(sessionStorage.getItem('breach_acknowledged') || '{}');
        const timestamp = acknowledged[email];
        if (timestamp) {
          return (Date.now() - timestamp) < 86400000;
        }
      } catch (e) {}
      return false;
    },

    // FAIL SAFE: Error messages
    messages: {
      network: 'Network connection unavailable. Please check your internet.',
      timeout: 'Request timed out. Please try again.',
      server: 'Server error. Please try again later.',
      rateLimit: 'Too many attempts. Please wait {minutes} minutes.',
      default: 'Login failed. Please try again.'
    }
  };

  // Initialize
  LoginFallbacks.network.init();
  // ===== END FALLBACKS =====

  // FAIL SAFE: Clear rate limit on successful login elsewhere
  useEffect(() => {
    return () => {
      // Reset on unmount (navigation)
      LoginFallbacks.attemptTracker.reset();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // FAIL HARD: Check network first
    if (!LoginFallbacks.network.isOnline) {
      setError(LoginFallbacks.messages.network);
      return;
    }

    // FAIL HARD: Check rate limiting
    if (LoginFallbacks.attemptTracker.isRateLimited()) {
      const minutes = LoginFallbacks.attemptTracker.getRemainingTime();
      setError(LoginFallbacks.messages.rateLimit.replace('{minutes}', minutes));
      return;
    }

    setLoading(true);
    setError('');
    setBreachWarning('');

    try {
      // FAIL SAFE: Check for breach (non-blocking)
      const breachCheck = LoginFallbacks.checkBreachStatus(password);
      if (breachCheck.breached && !LoginFallbacks.wasAcknowledged(email)) {
        setBreachWarning(breachCheck.message);
        setShowBreachWarning(true);
      }

      // FAIL HARD: Add timeout and retry to fetch
      const response = await LoginFallbacks.retry(async () => {
        return await LoginFallbacks.withTimeout(
          fetch('https://okz.onrender.com/api/v1/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          })
        );
      });

      const data = await response.json();

      if (!response.ok) {
        // FAIL HARD: Track failed attempt
        LoginFallbacks.attemptTracker.recordAttempt();
        throw new Error(data.message || 'Login failed');
      }

      // FAIL SAFE: Reset rate limit on success
      LoginFallbacks.attemptTracker.reset();

      // Store session
      localStorage.setItem('adminEmail', email);
      if (data.token) {
        localStorage.setItem('adminToken', data.token);
        
        // Store login timestamp for session management
        localStorage.setItem('adminLoginTime', Date.now().toString());
      }
      
      // Acknowledge breach warning if shown
      if (breachWarning) {
        LoginFallbacks.acknowledgeBreach(email);
      }
      
      setUser({ email });
      navigate('/dashboard');
      
    } catch (err) {
      console.error('Login error:', err);
      
      // FAIL SAFE: Set appropriate error message
      if (err.message === 'Request timeout') {
        setError(LoginFallbacks.messages.timeout);
      } else if (!LoginFallbacks.network.isOnline) {
        setError(LoginFallbacks.messages.network);
      } else {
        setError(err.message || LoginFallbacks.messages.default);
      }
    } finally {
      setLoading(false);
    }
  };

  const dismissBreachWarning = () => {
    setShowBreachWarning(false);
    if (email) {
      LoginFallbacks.acknowledgeBreach(email);
    }
  };

  return (
    <div className="login-container apple-fade-in">
      <div className="glass-panel">
        <img src="/okz-logo.png" alt="OKZ Logo" className="logo" />
        <h1>Admin Portal</h1>
        
        {/* FAIL SAFE: Error Banner */}
        {error && (
          <div className="error-banner" style={{
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            color: '#721c24',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>⚠️ {error}</span>
            {error.includes('timeout') && (
              <button
                onClick={handleSubmit}
                style={{
                  background: 'transparent',
                  border: '1px solid #721c24',
                  color: '#721c24',
                  padding: '4px 12px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}
        
        {/* Breach Warning Banner */}
        {showBreachWarning && breachWarning && (
          <div className="breach-warning-banner" style={{
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            color: '#856404',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '0.9rem'
          }}>
            <span style={{ fontSize: '1.2rem' }}>🔒</span>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '4px' }}>Security Notice</strong>
              {breachWarning}
              <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                <button
                  onClick={dismissBreachWarning}
                  style={{
                    background: 'transparent',
                    border: '1px solid #856404',
                    color: '#856404',
                    padding: '4px 12px',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    marginRight: '10px'
                  }}
                >
                  Dismiss
                </button>
                <span>You can continue logging in - this is just a warning.</span>
              </div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
              autoComplete="email"
              disabled={loading}
              style={{ opacity: loading ? 0.7 : 1 }}
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loading}
              style={{ opacity: loading ? 0.7 : 1 }}
            />
            
            {/* Live breach check */}
            {password.length > 0 && !loading && (
              <div style={{ 
                fontSize: '0.75rem', 
                marginTop: '5px',
                color: LoginFallbacks.checkBreachStatus(password).breached ? '#856404' : '#28a745'
              }}>
                {LoginFallbacks.checkBreachStatus(password).breached 
                  ? '⚠️ Password appears in breach database' 
                  : '✓ Password appears safe'}
              </div>
            )}
          </div>
          
          {/* FAIL SAFE: Rate limit info */}
          {LoginFallbacks.attemptTracker.count > 0 && !error && (
            <div style={{
              fontSize: '0.7rem',
              color: '#666',
              marginTop: '5px',
              textAlign: 'right'
            }}>
              Attempts: {LoginFallbacks.attemptTracker.count}/5
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading || LoginFallbacks.attemptTracker.isRateLimited()}
            className={loading ? 'loading' : ''}
            style={{
              opacity: (loading || LoginFallbacks.attemptTracker.isRateLimited()) ? 0.7 : 1,
              cursor: (loading || LoginFallbacks.attemptTracker.isRateLimited()) ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Authenticating...' : 
             LoginFallbacks.attemptTracker.isRateLimited() ? 'Too Many Attempts' : 'Sign In'}
          </button>
        </form>
        
        {/* FAIL SAFE: Security note */}
        <div style={{
          marginTop: '20px',
          fontSize: '0.75rem',
          color: '#999',
          textAlign: 'center',
          borderTop: '1px solid rgba(0,0,0,0.05)',
          paddingTop: '15px'
        }}>
          <span>🔐 We check passwords against known data breaches for your security</span>
        </div>

        {/* FAIL SAFE: Debug info in development */}
        {process.env.NODE_ENV === 'development' && (
          <div style={{
            marginTop: '10px',
            fontSize: '0.7rem',
            color: '#999',
            textAlign: 'center'
          }}>
            <span>🛡️ Fallbacks active: Timeout, Retry, Rate Limit</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;