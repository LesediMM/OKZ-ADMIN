// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css'; // Apple-inspired global styles

// ===== FALLBACKS - Isolated inline =====
const MainFallbacks = {
  // Check if DOM is ready
  isDOMReady: () => {
    return document.readyState === 'complete' || document.readyState === 'interactive';
  },

  // Wait for DOM if not ready
  waitForDOM: () => {
    return new Promise((resolve) => {
      if (MainFallbacks.isDOMReady()) {
        resolve();
      } else {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      }
    });
  },

  // Fallback container if root missing
  createFallbackContainer() {
    console.warn('[Main] #root container not found, creating fallback');
    const fallbackContainer = document.createElement('div');
    fallbackContainer.id = 'root-fallback';
    fallbackContainer.style.cssText = `
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(145deg, #f8faff 0%, #f0f5ff 100%);
    `;
    document.body.appendChild(fallbackContainer);
    return fallbackContainer;
  },

  // Hide loading indicator
  hideLoadingIndicator() {
    const loader = document.getElementById('loading-indicator');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => {
        loader.style.display = 'none';
      }, 300);
    }
  },

  // Error fallback UI
  renderErrorFallback(container, error) {
    const fallbackUI = `
      <div style="text-align: center; padding: 40px; max-width: 500px; margin: 0 auto;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">⚠️</div>
        <h1 style="color: #1a2b56; margin-bottom: 1rem;">OKZ Admin</h1>
        <p style="color: #666; margin-bottom: 2rem;">Unable to start application. Please refresh the page.</p>
        <button onclick="window.location.reload()" style="
          background: #0071e3;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
          font-weight: 600;
        ">Refresh Page</button>
        <p style="color: #999; font-size: 0.8rem; margin-top: 2rem;">
          Error: ${error?.message || 'Unknown error'}
        </p>
      </div>
    `;
    
    if (container) {
      container.innerHTML = fallbackUI;
    } else {
      document.body.innerHTML = fallbackUI;
    }
  },

  // Performance monitoring
  performance: {
    startTime: performance.now(),
    
    mark(name) {
      if (import.meta.env.DEV) {
        performance.mark(name);
      }
    },
    
    logLoadTime() {
      const loadTime = performance.now() - this.startTime;
      console.log(`[Performance] Admin loaded in ${loadTime.toFixed(2)}ms`);
    }
  },

  // Retry mounting with backoff
  async mountWithRetry(mountFn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await mountFn();
      } catch (err) {
        const isLast = i === maxRetries - 1;
        if (isLast) throw err;
        
        const wait = 1000 * Math.pow(2, i);
        console.log(`[Main] Mount retry ${i + 1}/${maxRetries} in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  },

  // Browser compatibility check
  checkBrowserSupport() {
    const checks = {
      react: typeof React !== 'undefined',
      reactDOM: typeof ReactDOM !== 'undefined',
      promise: typeof Promise !== 'undefined',
      fetch: typeof window.fetch !== 'undefined',
      localStorage: (() => { try { return !!window.localStorage; } catch(e) { return false; } })(),
      cookies: navigator.cookieEnabled
    };
    
    const supported = Object.values(checks).every(Boolean);
    
    if (!supported) {
      console.warn('[Main] Browser compatibility issues:', 
        Object.entries(checks).filter(([_, v]) => !v).map(([k]) => k)
      );
    }
    
    return { supported, checks };
  },

  // Error logging
  errors: [],
  
  logError(type, error, context = {}) {
    const errorEntry = {
      type,
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      context,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    this.errors.push(errorEntry);
    console.error(`[Main] ${type}:`, error?.message || error);
    
    // Keep last 10 errors
    if (this.errors.length > 10) {
      this.errors.shift();
    }
  }
};

// Mark initial performance point
MainFallbacks.performance.mark('main-start');
// ===== END FALLBACKS =====

// FAIL SAFE: Mount application with protections
(async function bootstrap() {
  try {
    // Check browser support first
    const browserCheck = MainFallbacks.checkBrowserSupport();
    if (!browserCheck.supported) {
      console.warn('[Main] Unsupported features detected, but continuing');
    }

    // Wait for DOM to be ready
    await MainFallbacks.waitForDOM();

    // Get root element with retry
    let rootElement = await MainFallbacks.mountWithRetry(async () => {
      const element = document.getElementById('root');
      if (!element) {
        throw new Error('#root element not found');
      }
      return element;
    });

    // Hide loading indicator
    MainFallbacks.hideLoadingIndicator();

    // Create React root and render
    try {
      const root = ReactDOM.createRoot(rootElement);
      
      MainFallbacks.performance.mark('render-start');
      
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
      
      MainFallbacks.performance.mark('render-end');
      MainFallbacks.performance.logLoadTime();
      
      console.log('✅ OKZ Admin: Bootstrap complete');
    } catch (renderError) {
      MainFallbacks.logError('render', renderError);
      MainFallbacks.renderErrorFallback(rootElement, renderError);
    }
  } catch (error) {
    MainFallbacks.logError('bootstrap', error);
    
    // Ultimate fallback - try to render error in any container
    const root = document.getElementById('root') || MainFallbacks.createFallbackContainer();
    MainFallbacks.renderErrorFallback(root, error);
  }
})();

// Expose debug tools in development
if (import.meta.env.DEV) {
  window.__OKZ_ADMIN_DEBUG__ = {
    getErrors: () => MainFallbacks.errors,
    getPerformance: () => ({
      loadTime: performance.now() - MainFallbacks.performance.startTime,
      marks: performance.getEntriesByType('mark').map(m => ({ name: m.name, time: m.startTime }))
    }),
    checkBrowser: () => MainFallbacks.checkBrowserSupport(),
    version: '1.0.0'
  };
  console.log('[Debug] OKZ Admin debug tools available at window.__OKZ_ADMIN_DEBUG__');
}

// Handle unhandled errors
window.addEventListener('error', (event) => {
  MainFallbacks.logError('window-error', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  MainFallbacks.logError('unhandled-rejection', event.reason);
});