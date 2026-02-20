// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import History from './pages/History';

// ===== FALLBACKS - Isolated inline =====
const AppFallbacks = {
  // Session validation
  validateSession: () => {
    const email = localStorage.getItem('adminEmail');
    const token = localStorage.getItem('adminToken');
    
    // Check if both exist
    if (!email || !token) return false;
    
    // Check token format (simple validation)
    if (typeof token !== 'string' || token.length < 10) return false;
    
    // Check email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;
    
    return true;
  },

  // Session expiry check (tokens expire after 24h)
  checkTokenExpiry: () => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) return true; // No token = expired
      
      // Simple JWT expiry check (if token is JWT format)
      if (token.split('.').length === 3) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp) {
          const expiry = payload.exp * 1000; // Convert to milliseconds
          return Date.now() >= expiry; // true if expired
        }
      }
      
      // Fallback: check session age
      const loginTime = localStorage.getItem('adminLoginTime');
      if (loginTime) {
        const age = Date.now() - parseInt(loginTime);
        return age > 24 * 60 * 60 * 1000; // 24 hours
      }
    } catch (e) {
      console.warn('Token expiry check failed:', e);
    }
    return false; // Assume not expired if we can't check
  },

  // Clean session (remove all session data)
  cleanSession: () => {
    localStorage.removeItem('adminEmail');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminLoginTime');
    sessionStorage.clear(); // Clear any session storage too
  },

  // Save login timestamp
  recordLogin: (email, token) => {
    localStorage.setItem('adminEmail', email);
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminLoginTime', Date.now().toString());
  },

  // Session monitor (check every minute)
  startSessionMonitor: (onExpire) => {
    const interval = setInterval(() => {
      if (AppFallbacks.checkTokenExpiry()) {
        AppFallbacks.cleanSession();
        onExpire();
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  },

  // Network status
  network: {
    isOnline: navigator.onLine,
    listeners: [],
    
    init() {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.listeners.forEach(fn => fn(true));
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.listeners.forEach(fn => fn(false));
      });
    },
    
    subscribe(listener) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter(l => l !== listener);
      };
    }
  },

  // Loading component
  LoadingSpinner: () => (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(145deg, #f8faff 0%, #f0f5ff 100%)'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid rgba(0, 113, 227, 0.1)',
        borderTopColor: '#0071e3',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  ),

  // Error boundary fallback
  ErrorFallback: ({ error, resetError }) => (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'linear-gradient(145deg, #f8faff 0%, #f0f5ff 100%)'
    }}>
      <div className="glass-panel" style={{ maxWidth: '400px', padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ color: '#1a2b56', marginBottom: '1rem' }}>Something went wrong</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          {error?.message || 'The application encountered an error'}
        </p>
        <button
          onClick={resetError}
          style={{
            background: '#0071e3',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  ),

  // Health check
  getHealth: () => ({
    authenticated: AppFallbacks.validateSession(),
    network: AppFallbacks.network.isOnline,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent
  })
};

// Initialize network monitor
AppFallbacks.network.init();
// ===== END FALLBACKS =====

// Protected Route Component with enhanced checks
const ProtectedRoute = ({ children }) => {
  const [isValid, setIsValid] = useState(true);
  const navigate = useNavigate();
  
  // FAIL HARD: Validate session on every route change
  useEffect(() => {
    const checkSession = () => {
      // Check if authenticated
      const hasCredentials = localStorage.getItem('adminEmail') !== null && 
                            localStorage.getItem('adminToken') !== null;
      
      // Validate session integrity
      const isValidSession = AppFallbacks.validateSession();
      const isExpired = AppFallbacks.checkTokenExpiry();
      
      if (!hasCredentials || !isValidSession || isExpired) {
        // FAIL SAFE: Clean up and redirect
        AppFallbacks.cleanSession();
        setIsValid(false);
        navigate('/login', { replace: true });
      }
    };
    
    checkSession();
    
    // Set up session monitor
    const cleanup = AppFallbacks.startSessionMonitor(() => {
      AppFallbacks.cleanSession();
      setIsValid(false);
      navigate('/login', { replace: true });
    });
    
    return cleanup;
  }, [navigate]);
  
  // Show nothing while checking (prevents flash)
  if (!isValid) return null;
  
  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [networkStatus, setNetworkStatus] = useState(AppFallbacks.network.isOnline);

  // FAIL SAFE: Subscribe to network changes
  useEffect(() => {
    const unsubscribe = AppFallbacks.network.subscribe(setNetworkStatus);
    return unsubscribe;
  }, []);

  // Check for existing session on app load
  useEffect(() => {
    try {
      const adminEmail = localStorage.getItem('adminEmail');
      const adminToken = localStorage.getItem('adminToken');
      
      // FAIL HARD: Validate session integrity
      const isValid = AppFallbacks.validateSession();
      const isExpired = AppFallbacks.checkTokenExpiry();
      
      if (adminEmail && adminToken && isValid && !isExpired) {
        setUser({ email: adminEmail });
      } else if (adminEmail || adminToken) {
        // Partial session found - clean it up
        AppFallbacks.cleanSession();
      }
    } catch (err) {
      console.error('Session check error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // FAIL SAFE: Error boundary style catch
  if (hasError) {
    return <AppFallbacks.ErrorFallback 
      error={error} 
      resetError={() => {
        setHasError(false);
        setError(null);
        AppFallbacks.cleanSession();
        window.location.href = '/login';
      }} 
    />;
  }

  // Show loading spinner while checking auth
  if (loading) {
    return <AppFallbacks.LoadingSpinner />;
  }

  return (
    <BrowserRouter>
      {/* FAIL SAFE: Offline indicator */}
      {!networkStatus && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ffc107',
          color: '#000',
          padding: '8px 16px',
          borderRadius: '30px',
          fontSize: '0.85rem',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          pointerEvents: 'none'
        }}>
          📱 Offline mode - Some features may be limited
        </div>
      )}

      <Routes>
        <Route 
          path="/login" 
          element={
            <Login 
              setUser={(userData) => {
                setUser(userData);
                // Login component handles storage
              }} 
            />
          } 
        />
        
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard user={user} />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/history" 
          element={
            <ProtectedRoute>
              <History user={user} />
            </ProtectedRoute>
          } 
        />
        
        {/* Root redirect */}
        <Route 
          path="/" 
          element={<Navigate to="/dashboard" replace />} 
        />
        
        {/* Catch all - redirect to dashboard (protected route will handle auth) */}
        <Route 
          path="*" 
          element={<Navigate to="/dashboard" replace />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

// Error Boundary Wrapper
class AppWithErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <AppFallbacks.ErrorFallback 
        error={this.state.error}
        resetError={() => {
          this.setState({ hasError: false, error: null });
          AppFallbacks.cleanSession();
          window.location.href = '/login';
        }}
      />;
    }

    return <App />;
  }
}

// Need to import React for error boundary
import React from 'react';
import { useNavigate } from 'react-router-dom';

export default AppWithErrorBoundary;