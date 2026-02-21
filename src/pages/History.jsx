import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Dashboard.css';

const History = ({ user }) => {
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [courtFilter, setCourtFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [retryCount, setRetryCount] = useState(0);
  
  // View tabs
  const [activeView, setActiveView] = useState('today');
  
  const navigate = useNavigate();

  // ===== FALLBACKS - Isolated inline =====
  const HistoryFallbacks = {
    // Cache management (extended)
    cache: {
      save: (key, data) => {
        try {
          localStorage.setItem(`history_${key}`, JSON.stringify({
            data,
            timestamp: Date.now()
          }));
        } catch (e) {}
      },
      
      load: (key, maxAge = 300000) => {
        try {
          const cached = localStorage.getItem(`history_${key}`);
          if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < maxAge) {
              return data;
            }
          }
        } catch (e) {}
        return null;
      },

      // FAIL SAFE: Load from cache on init
      initFromCache: () => {
        try {
          const cached = localStorage.getItem('history_all');
          if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            // Use cache if less than 1 hour old
            if (Date.now() - timestamp < 3600000) {
              return data;
            }
          }
        } catch (e) {}
        return null;
      }
    },

    // Date categorization - UPDATED: 30 days past, 30 days future
    categorizeBookings: (bookings) => {
      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);
      
      // Calculate 30 days ago from today (midnight)
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      
      // Calculate 30 days from today (end of day)
      const thirtyDaysFromNow = new Date(today);
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      thirtyDaysFromNow.setHours(23, 59, 59, 999);
      
      return {
        today: bookings.filter(b => {
          const bookingDate = new Date(b.date);
          return bookingDate >= today && bookingDate <= endOfToday;
        }),
        upcoming: bookings.filter(b => {
          const bookingDate = new Date(b.date);
          return bookingDate > endOfToday && bookingDate <= thirtyDaysFromNow;
        }),
        past: bookings.filter(b => {
          const bookingDate = new Date(b.date);
          return bookingDate < today && bookingDate >= thirtyDaysAgo;
        })
      };
    },
    
    // Revenue calculation
    calculateRevenue: (bookings) => {
      return bookings.reduce((sum, b) => {
        const amount = b.price || b.revenue || (b.courtType?.toLowerCase() === 'padel' ? 400 : 150);
        return sum + (b.status?.toLowerCase() === 'cancelled' ? 0 : amount);
      }, 0);
    },
    
    // Payment simplification
    simplifyPayment: (booking) => {
      return {
        ...booking,
        paymentStatus: booking.status?.toLowerCase() === 'cancelled' ? 'refunded' : 'paid',
        revenue: booking.price || booking.revenue || (booking.courtType?.toLowerCase() === 'padel' ? 400 : 150)
      };
    },

    // FAIL HARD: Retry with backoff
    async retry(fn, maxRetries = 3) {
      let lastError;
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (err) {
          lastError = err;
          if (i === maxRetries - 1) break;
          
          // Don't retry auth errors
          if (err.message?.includes('401') || err.message?.includes('Session expired')) {
            throw err;
          }
          
          const wait = 1000 * Math.pow(2, i);
          console.log(`🔄 History retry ${i + 1}/${maxRetries} in ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
        }
      }
      throw lastError;
    },

    // FAIL HARD: Timeout wrapper
    async withTimeout(promise, ms = 10000) {
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), ms)
      );
      return Promise.race([promise, timeout]);
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

    // FAIL SAFE: Session validator
    validateSession: () => {
      const token = localStorage.getItem('adminToken');
      const email = localStorage.getItem('adminEmail');
      
      if (!token || !email) return false;
      
      // Simple token format check
      if (token.split('.').length === 3) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            return false;
          }
        } catch (e) {}
      }
      
      return true;
    },

    // FAIL SAFE: Error messages
    messages: {
      network: 'Network connection lost. Showing cached data.',
      timeout: 'Request timed out. Please try again.',
      server: 'Server error. Using cached data.',
      session: 'Session expired. Please login again.',
      default: 'Unable to load history data.'
    },

    // Track failures
    failureCount: 0,
    lastFailure: null,
    
    recordFailure() {
      this.failureCount++;
      this.lastFailure = Date.now();
    },
    
    shouldBlock() {
      if (this.failureCount >= 5 && Date.now() - this.lastFailure < 300000) {
        return true;
      }
      if (Date.now() - this.lastFailure > 300000) {
        this.failureCount = 0;
      }
      return false;
    },

    // Export/Import functionality (FAIL SAFE)
    exportBookings: (bookings) => {
      try {
        const dataStr = JSON.stringify(bookings, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `okz_history_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
      } catch (e) {
        console.error('Export failed:', e);
      }
    }
  };

  // Initialize
  HistoryFallbacks.network.init();
  const initialCachedData = HistoryFallbacks.cache.initFromCache();
  // ===== END FALLBACKS =====

  const fetchHistory = async (isRetry = false) => {
    try {
      setLoading(true);
      setError('');
      
      // FAIL HARD: Check circuit breaker
      if (HistoryFallbacks.shouldBlock()) {
        setError('Too many failed attempts. Please try again later.');
        setLoading(false);
        return;
      }

      // FAIL SAFE: Check session first
      if (!HistoryFallbacks.validateSession()) {
        localStorage.removeItem('adminEmail');
        localStorage.removeItem('adminToken');
        navigate('/login');
        return;
      }
      
      // Try cache first if offline
      if (!HistoryFallbacks.network.isOnline) {
        const cached = HistoryFallbacks.cache.load('all', 3600000);
        if (cached) {
          const simplified = cached.map(HistoryFallbacks.simplifyPayment);
          setBookings(simplified);
          applyViewFilter(simplified, activeView);
          setError(HistoryFallbacks.messages.network);
          setLoading(false);
          return;
        }
      }

      // FAIL HARD: Add timeout and retry to fetch
      const fetchFn = async () => {
        const response = await HistoryFallbacks.withTimeout(
          fetch('https://okz.onrender.com/api/v1/admin/history', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
              'Content-Type': 'application/json'
            }
          })
        );
        
        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem('adminEmail');
            localStorage.removeItem('adminToken');
            navigate('/login');
            throw new Error('Session expired. Please login again.');
          }
          throw new Error(`Failed to fetch history (${response.status})`);
        }
        
        return await response.json();
      };

      // Use retry logic
      const data = await HistoryFallbacks.retry(fetchFn, 3);
      
      // Reset failure count on success
      HistoryFallbacks.failureCount = 0;
      
      // Simplify payment data
      const simplifiedData = data.map(HistoryFallbacks.simplifyPayment);
      
      setBookings(simplifiedData);
      applyViewFilter(simplifiedData, activeView);
      
      // Save to cache
      HistoryFallbacks.cache.save('all', simplifiedData);
      setError('');
      
    } catch (err) {
      console.error('History fetch error:', err);
      HistoryFallbacks.recordFailure();
      
      // FAIL SAFE: Try cache as fallback
      const cached = HistoryFallbacks.cache.load('all', 86400000);
      if (cached) {
        const simplified = cached.map(HistoryFallbacks.simplifyPayment);
        setBookings(simplified);
        applyViewFilter(simplified, activeView);
        
        if (err.message === 'Request timeout') {
          setError(HistoryFallbacks.messages.timeout);
        } else if (!HistoryFallbacks.network.isOnline) {
          setError(HistoryFallbacks.messages.network);
        } else {
          setError(HistoryFallbacks.messages.server);
        }
      } else {
        setError(err.message || HistoryFallbacks.messages.default);
      }
    } finally {
      setLoading(false);
    }
  };

  // Apply view filter
  const applyViewFilter = (bookingsToFilter, view) => {
    const categorized = HistoryFallbacks.categorizeBookings(bookingsToFilter);
    
    switch(view) {
      case 'today':
        setFilteredBookings(categorized.today);
        break;
      case 'upcoming':
        setFilteredBookings(categorized.upcoming);
        break;
      case 'past':
        setFilteredBookings(categorized.past);
        break;
      default:
        setFilteredBookings(bookingsToFilter);
    }
  };

  // FAIL SAFE: Network status subscription
  useEffect(() => {
    const unsubscribe = HistoryFallbacks.network.subscribe((isOnline) => {
      if (isOnline && error) {
        fetchHistory(true);
      }
    });
    
    return unsubscribe;
  }, [error]);

  // FAIL SAFE: Load from cache immediately if available
  useEffect(() => {
    if (initialCachedData) {
      const simplified = initialCachedData.map(HistoryFallbacks.simplifyPayment);
      setBookings(simplified);
      applyViewFilter(simplified, activeView);
    }
    fetchHistory();
  }, []);

  // Apply view filter when activeView changes
  useEffect(() => {
    if (bookings.length > 0) {
      applyViewFilter(bookings, activeView);
    }
  }, [activeView, bookings]);

  // Apply search and other filters
  useEffect(() => {
    let filtered = [...bookings];

    // First apply view filter
    const categorized = HistoryFallbacks.categorizeBookings(filtered);
    switch(activeView) {
      case 'today':
        filtered = categorized.today;
        break;
      case 'upcoming':
        filtered = categorized.upcoming;
        break;
      case 'past':
        filtered = categorized.past;
        break;
      default:
        break;
    }

    // Apply search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(booking => 
        booking.customerName?.toLowerCase().includes(term) ||
        booking.phoneNumber?.toLowerCase().includes(term) ||
        booking.email?.toLowerCase().includes(term) ||
        booking.courtType?.toLowerCase().includes(term) ||
        booking.id?.toString().includes(term) ||
        booking.notes?.toLowerCase().includes(term)
      );
    }

    // Date range filters
    if (dateRange.start) {
      filtered = filtered.filter(booking => 
        new Date(booking.date) >= new Date(dateRange.start)
      );
    }
    if (dateRange.end) {
      filtered = filtered.filter(booking => 
        new Date(booking.date) <= new Date(dateRange.end)
      );
    }

    // Court type filter
    if (courtFilter !== 'all') {
      filtered = filtered.filter(booking => 
        booking.courtType?.toLowerCase() === courtFilter.toLowerCase()
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(booking => 
        booking.status?.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    setFilteredBookings(filtered);
  }, [searchTerm, bookings, dateRange, courtFilter, statusFilter, activeView]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    
    const sorted = [...filteredBookings].sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];
      
      if (key === 'date') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (key === 'revenue' || key === 'price') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }
      
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    setFilteredBookings(sorted);
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const handleRowClick = (booking) => {
    setSelectedBooking(booking);
    setShowModal(true);
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    fetchHistory(true);
  };

  const handleExport = () => {
    HistoryFallbacks.exportBookings(filteredBookings);
  };

  // Calculate revenue
  const totalRevenue = filteredBookings.reduce((sum, b) => {
    if (b.status?.toLowerCase() === 'cancelled') return sum;
    return sum + (b.price || b.revenue || (b.courtType?.toLowerCase() === 'padel' ? 400 : 150));
  }, 0);
  
  const uniquePlayers = new Set(filteredBookings.map(b => b.customerName)).size;
  const averageBookingValue = filteredBookings.length > 0 
    ? totalRevenue / filteredBookings.filter(b => b.status?.toLowerCase() !== 'cancelled').length 
    : 0;

  const categorized = HistoryFallbacks.categorizeBookings(bookings);

  if (loading && !bookings.length) {
    return (
      <div className="dashboard-container apple-fade-in">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading history...</p>
        </div>
      </div>
    );
  }

  if (error && !bookings.length) {
    return (
      <div className="dashboard-container apple-fade-in">
        <div className="error-container">
          <div className="error-banner">{error}</div>
          <button onClick={handleRetry} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container apple-fade-in">
      {/* Offline/Cache indicator */}
      {!HistoryFallbacks.network.isOnline && (
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
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          📱 Offline mode - Showing cached data
        </div>
      )}

      {/* Error message with retry */}
      {error && (
        <div style={{
          backgroundColor: 'rgba(255,193,7,0.1)',
          border: '1px solid #ffc107',
          color: '#856404',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>⚠️ {error}</span>
          <button
            onClick={handleRetry}
            style={{
              background: 'transparent',
              border: '1px solid #856404',
              color: '#856404',
              padding: '4px 12px',
              borderRadius: '16px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            Retry
          </button>
        </div>
      )}

      <header className="history-header">
        <div className="header-left">
          <button onClick={() => navigate('/dashboard')} className="back-button">
            ← Back to Dashboard
          </button>
          <h1>Booking History</h1>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="export-button"
            onClick={handleExport}
            style={{
              background: 'transparent',
              border: '1px solid #0071e3',
              color: '#0071e3',
              padding: '8px 16px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            📥 Export
          </button>
          <button 
            className="filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </header>

      {/* View Tabs - All Time tab removed */}
      <div className="view-tabs" style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '20px',
        borderBottom: '1px solid rgba(0,0,0,0.1)',
        paddingBottom: '10px'
      }}>
        <button
          onClick={() => setActiveView('today')}
          className={`view-tab ${activeView === 'today' ? 'active' : ''}`}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: 'none',
            background: activeView === 'today' ? '#0071e3' : 'transparent',
            color: activeView === 'today' ? 'white' : '#666',
            cursor: 'pointer',
            fontWeight: activeView === 'today' ? '600' : '400'
          }}
        >
          Today ({categorized.today.length})
        </button>
        <button
          onClick={() => setActiveView('upcoming')}
          className={`view-tab ${activeView === 'upcoming' ? 'active' : ''}`}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: 'none',
            background: activeView === 'upcoming' ? '#0071e3' : 'transparent',
            color: activeView === 'upcoming' ? 'white' : '#666',
            cursor: 'pointer',
            fontWeight: activeView === 'upcoming' ? '600' : '400'
          }}
        >
          Next 30 Days ({categorized.upcoming.length})
        </button>
        <button
          onClick={() => setActiveView('past')}
          className={`view-tab ${activeView === 'past' ? 'active' : ''}`}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: 'none',
            background: activeView === 'past' ? '#0071e3' : 'transparent',
            color: activeView === 'past' ? 'white' : '#666',
            cursor: 'pointer',
            fontWeight: activeView === 'past' ? '600' : '400'
          }}
        >
          Last 30 Days ({categorized.past.length})
        </button>
      </div>

      {/* Search and Filters */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by name, phone, email, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <button 
              className="clear-search"
              onClick={() => setSearchTerm('')}
            >
              ✕
            </button>
          )}
        </div>

        {showFilters && (
          <div className="advanced-filters glass-panel">
            <div className="filter-row">
              <div className="filter-group">
                <label>Date From:</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                />
              </div>
              <div className="filter-group">
                <label>Date To:</label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                />
              </div>
            </div>
            
            <div className="filter-row">
              <div className="filter-group">
                <label>Court Type:</label>
                <select 
                  value={courtFilter} 
                  onChange={(e) => setCourtFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Courts</option>
                  <option value="padel">Padel</option>
                  <option value="tennis">Tennis</option>
                </select>
              </div>
              
              <div className="filter-group">
                <label>Status:</label>
                <select 
                  value={statusFilter} 
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            
            <button 
              className="clear-filters"
              onClick={() => {
                setDateRange({ start: '', end: '' });
                setSearchTerm('');
                setCourtFilter('all');
                setStatusFilter('all');
              }}
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="stats-grid history-stats">
        <div className="glass-panel stat-card small">
          <h3>Total Bookings</h3>
          <p className="stat-value">{filteredBookings.length}</p>
          <span className="stat-label">
            {activeView !== 'all' && `${activeView} view`}
          </span>
        </div>
        <div className="glass-panel stat-card small">
          <h3>Total Revenue</h3>
          <p className="stat-value">{formatCurrency(totalRevenue)}</p>
          <span className="stat-label">All bookings paid</span>
        </div>
        <div className="glass-panel stat-card small">
          <h3>Unique Players</h3>
          <p className="stat-value">{uniquePlayers}</p>
          <span className="stat-label">Active customers</span>
        </div>
        <div className="glass-panel stat-card small">
          <h3>Avg. Booking</h3>
          <p className="stat-value">{formatCurrency(averageBookingValue)}</p>
          <span className="stat-label">Per paid booking</span>
        </div>
      </div>

      {/* History Table */}
      <div className="glass-panel history-table-container">
        <table className="history-table detailed">
          <thead>
            <tr>
              <th onClick={() => requestSort('date')} className="sortable">
                Date/Time {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('customerName')} className="sortable">
                Customer {sortConfig.key === 'customerName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th>Court Details</th>
              <th>Duration</th>
              <th onClick={() => requestSort('price')} className="sortable">
                Amount {sortConfig.key === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th>Payment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.length > 0 ? (
              filteredBookings.map((booking) => (
                <tr 
                  key={booking.id} 
                  className={`booking-row clickable ${booking.status?.toLowerCase() === 'cancelled' ? 'cancelled-row' : ''}`}
                  onClick={() => handleRowClick(booking)}
                  style={{
                    opacity: booking.status?.toLowerCase() === 'cancelled' ? 0.7 : 1,
                    textDecoration: booking.status?.toLowerCase() === 'cancelled' ? 'line-through' : 'none'
                  }}
                >
                  <td>
                    <div className="date-time">
                      <span className="date">{formatDate(booking.date).split(',')[0]}</span>
                      <span className="time">{formatDate(booking.date).split(',')[1]}</span>
                    </div>
                  </td>
                  <td>
                    <div className="customer-info-detailed">
                      <span className="customer-name">{booking.customerName}</span>
                      <span className="customer-phone">{booking.phoneNumber || 'No phone'}</span>
                      {booking.email && <span className="customer-email">{booking.email}</span>}
                    </div>
                  </td>
                  <td>
                    <div className="court-details">
                      <span className="court-type">{booking.courtType || 'Padel'}</span>
                      <span className="court-number">Court #{booking.courtNumber || '1'}</span>
                    </div>
                  </td>
                  <td>
                    <span className="duration-badge">
                      {booking.duration || 1}h
                    </span>
                  </td>
                  <td>
                    <span className="revenue-amount">
                      {formatCurrency(booking.price || booking.revenue || (booking.courtType?.toLowerCase() === 'padel' ? 400 : 150))}
                    </span>
                  </td>
                  <td>
                    <span className="payment-method">
                      {booking.paymentMethod || 'Online'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${booking.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'paid'}`}>
                      {booking.status === 'cancelled' ? 'Cancelled' : 'Paid'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="no-results">
                  <div className="empty-state">
                  <p>...</p>
                    {(searchTerm || dateRange.start || dateRange.end || courtFilter !== 'all' || statusFilter !== 'all') && (
                      <button 
                        className="clear-filters-btn"
                        onClick={() => {
                          setSearchTerm('');
                          setDateRange({ start: '', end: '' });
                          setCourtFilter('all');
                          setStatusFilter('all');
                        }}
                      >
                        Clear All Filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Booking Details Modal */}
      {showModal && selectedBooking && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Booking Details</h2>
              <button className="close-modal" onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-section">
                <h3>Booking Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Booking ID:</span>
                    <span className="detail-value"><code>{selectedBooking.id}</code></span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Date & Time:</span>
                    <span className="detail-value">{formatDate(selectedBooking.date)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Duration:</span>
                    <span className="detail-value">{selectedBooking.duration || 1} hour(s)</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Court:</span>
                    <span className="detail-value">
                      {selectedBooking.courtType || 'Padel'} • Court #{selectedBooking.courtNumber || '1'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Customer Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Name:</span>
                    <span className="detail-value">{selectedBooking.customerName}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Phone:</span>
                    <span className="detail-value">{selectedBooking.phoneNumber || 'Not provided'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Email:</span>
                    <span className="detail-value">{selectedBooking.email || 'Not provided'}</span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Payment Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Amount:</span>
                    <span className="detail-value price-large">
                      {formatCurrency(selectedBooking.price || selectedBooking.revenue || 
                        (selectedBooking.courtType?.toLowerCase() === 'padel' ? 400 : 150))}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Payment Method:</span>
                    <span className="detail-value">{selectedBooking.paymentMethod || 'Online'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status:</span>
                    <span className={`status-pill ${selectedBooking.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'paid'}`}>
                      {selectedBooking.status === 'cancelled' ? 'Cancelled' : 'Paid'}
                    </span>
                  </div>
                </div>
                {selectedBooking.status === 'cancelled' && (
                  <div style={{
                    marginTop: '10px',
                    padding: '8px',
                    background: 'rgba(220,53,69,0.1)',
                    borderRadius: '6px',
                    color: '#dc3545',
                    fontSize: '0.85rem'
                  }}>
                    ⚠️ This booking was cancelled - amount not included in revenue
                  </div>
                )}
              </div>

              {selectedBooking.notes && (
                <div className="detail-section">
                  <h3>Notes</h3>
                  <div className="notes-box">
                    {selectedBooking.notes}
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setShowModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;