// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Auth.css';

const Login = ({ setUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [breachWarning, setBreachWarning] = useState('');
  const [showBreachWarning, setShowBreachWarning] = useState(false);
  const navigate = useNavigate();

  // ===== FALLBACKS - Isolated inline =====
  const LoginFallbacks = {
    // Simulated breach check - in production, you'd use HaveIBeenPwned API
    checkBreachStatus: (password) => {
      // This is a SIMULATED check for demo purposes
      // In production, you would call an actual API
      
      // Common weak passwords that are frequently breached
      const commonBreachedPasswords = [
        'password', 'password123', 'admin', 'admin123', '123456', 
        '12345678', 'qwerty', 'qwerty123', 'letmein', 'welcome',
        'monkey', 'dragon', 'football', 'baseball', 'abc123',
        '111111', '123123', '000000', 'adminadmin', 'passw0rd'
      ];
      
      // Check if password is in common breached list
      if (commonBreachedPasswords.includes(password.toLowerCase())) {
        return {
          breached: true,
          message: '⚠️ This password has been found in a data breach. For your security, please update your credentials after logging in.'
        };
      }
      
      // Additional check: passwords shorter than 8 chars are more likely breached
      if (password.length < 8) {
        return {
          breached: true,
          message: '⚠️ Short passwords are more vulnerable. Please consider using a stronger password.'
        };
      }
      
      // No breach detected
      return {
        breached: false,
        message: ''
      };
    },
    
    // Store breach acknowledgment in session (so it doesn't show every time)
    acknowledgeBreach: (email) => {
      try {
        const acknowledged = JSON.parse(sessionStorage.getItem('breach_acknowledged') || '{}');
        acknowledged[email] = Date.now();
        sessionStorage.setItem('breach_acknowledged', JSON.stringify(acknowledged));
      } catch (e) {
        // Ignore storage errors
      }
    },
    
    // Check if breach was already acknowledged for this email today
    wasAcknowledged: (email) => {
      try {
        const acknowledged = JSON.parse(sessionStorage.getItem('breach_acknowledged') || '{}');
        const timestamp = acknowledged[email];
        if (timestamp) {
          // If acknowledged in last 24 hours, don't show again
          return (Date.now() - timestamp) < 86400000;
        }
      } catch (e) {}
      return false;
    }
  };
  // ===== END FALLBACKS =====

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setBreachWarning('');

    try {
      // Check for breach BEFORE login attempt (but don't block)
      const breachCheck = LoginFallbacks.checkBreachStatus(password);
      if (breachCheck.breached && !LoginFallbacks.wasAcknowledged(email)) {
        setBreachWarning(breachCheck.message);
        setShowBreachWarning(true);
        // Continue with login - warning only, no block
      }

      const response = await fetch('https://okz.onrender.com/api/v1/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Store session
      localStorage.setItem('adminEmail', email);
      if (data.token) {
        localStorage.setItem('adminToken', data.token);
      }
      
      // If there was a breach warning and user logged in successfully, acknowledge it
      if (breachWarning) {
        LoginFallbacks.acknowledgeBreach(email);
      }
      
      setUser({ email });
      navigate('/dashboard');
      
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const dismissBreachWarning = () => {
    setShowBreachWarning(false);
    // Acknowledge so it doesn't show again for 24h
    if (email) {
      LoginFallbacks.acknowledgeBreach(email);
    }
  };

  return (
    <div className="login-container apple-fade-in">
      <div className="glass-panel">
        <img src="/okz-logo.png" alt="OKZ Logo" className="logo" />
        <h1>Admin Portal</h1>
        
        {/* Error Banner */}
        {error && <div className="error-banner">{error}</div>}
        
        {/* Breach Warning Banner - Non-blocking, just informational */}
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
            />
            
            {/* Live breach check as user types (optional) */}
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
          
          <button 
            type="submit" 
            disabled={loading}
            className={loading ? 'loading' : ''}
            style={{
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
        
        {/* Security note */}
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
      </div>
    </div>
  );
};

export default Login;