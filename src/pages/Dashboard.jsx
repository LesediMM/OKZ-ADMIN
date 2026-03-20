import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Dashboard.css';

const Dashboard = ({ user }) => {
  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cachedData, setCachedData] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Create booking form state
  const [createForm, setCreateForm] = useState({
    email: '',
    fullName: '',
    courtType: 'padel',
    courtNumber: '1',
    date: '',
    timeSlot: '10:00',
    duration: 1,
    phoneNumber: '',
    notes: '',
    paymentStatus: 'paid'
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  
  const navigate = useNavigate();

  // ===== FALLBACKS - Isolated inline =====
  const DashboardFallbacks = {
    // Cache management
    cache: {
      save: (key, data) => {
        try {
          localStorage.setItem(`dashboard_${key}`, JSON.stringify({
            data,
            timestamp: Date.now()
          }));
        } catch (e) {}
      },
      
      load: (key, maxAge = 300000) => {
        try {
          const cached = localStorage.getItem(`dashboard_${key}`);
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
          const cached = localStorage.getItem('dashboard_overview');
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

    // Extract today's bookings from overview data
    extractTodayBookings: (data) => {
      if (!data) return [];
      
      // The overview endpoint returns todaySchedule array
      if (data.todaySchedule && Array.isArray(data.todaySchedule)) {
        return data.todaySchedule;
      }
      
      return [];
    },

    // Calculate revenue (cancelled bookings = 0)
    calculateRevenue: (bookings) => {
      return bookings.reduce((sum, b) => {
        if (b.status?.toLowerCase() === 'cancelled') return sum;
        return sum + (b.price || b.revenue || 0);
      }, 0);
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
          console.log(`🔄 Dashboard retry ${i + 1}/${maxRetries} in ${wait}ms`);
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
            return false; // Expired
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
      default: 'Unable to load dashboard data.'
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
    }
  };

  // Initialize
  DashboardFallbacks.network.init();
  
  // FAIL SAFE: Try to load from cache on initial render
  const initialCachedData = DashboardFallbacks.cache.initFromCache();
  // ===== END FALLBACKS =====

  const fetchOverviewData = async (isRetry = false) => {
    try {
      setLoading(true);
      setError('');
      
      // FAIL HARD: Check circuit breaker
      if (DashboardFallbacks.shouldBlock()) {
        setError('Too many failed attempts. Please try again later.');
        setLoading(false);
        return;
      }

      // FAIL SAFE: Check session first
      if (!DashboardFallbacks.validateSession()) {
        localStorage.removeItem('adminEmail');
        localStorage.removeItem('adminToken');
        navigate('/login');
        return;
      }
      
      // Try cache first if offline
      if (!DashboardFallbacks.network.isOnline) {
        const cached = DashboardFallbacks.cache.load('overview', 3600000);
        if (cached) {
          setOverviewData(cached);
          setCachedData(cached);
          setError(DashboardFallbacks.messages.network);
          setLoading(false);
          return;
        }
      }

      const fetchFn = async () => {
        // FAIL HARD: Add timeout to fetch
        const response = await DashboardFallbacks.withTimeout(
          fetch('https://okz.onrender.com/api/v1/admin/overview', {
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
          throw new Error(`Failed to fetch dashboard data (${response.status})`);
        }
        
        return await response.json();
      };

      // FAIL HARD: Use retry logic
      const data = await DashboardFallbacks.retry(fetchFn, 3);
      
      // Reset failure count on success
      DashboardFallbacks.failureCount = 0;
      
      // Ensure each booking has proper fields
      if (data.todaySchedule) {
        data.todaySchedule = data.todaySchedule.map(booking => ({
          ...booking,
          price: booking.price || booking.revenue || 
                 (booking.courtType?.toLowerCase() === 'padel' ? 400 : 150),
          date: booking.date || booking.time || new Date().toISOString(),
          id: booking.id || booking._id || `temp-${Date.now()}`,
          displayStatus: booking.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'paid'
        }));
      }
      
      setOverviewData(data);
      setCachedData(data);
      setError('');
      
      // Save to cache
      DashboardFallbacks.cache.save('overview', data);
      
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      DashboardFallbacks.recordFailure();
      
      // FAIL SAFE: Try cache as fallback
      const cached = DashboardFallbacks.cache.load('overview', 86400000);
      if (cached) {
        setOverviewData(cached);
        setCachedData(cached);
        
        // Set appropriate error message
        if (err.message === 'Request timeout') {
          setError(DashboardFallbacks.messages.timeout);
        } else if (!DashboardFallbacks.network.isOnline) {
          setError(DashboardFallbacks.messages.network);
        } else {
          setError(DashboardFallbacks.messages.server);
        }
      } else {
        setError(err.message || DashboardFallbacks.messages.default);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle create booking submission
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError('');
    setCreateSuccess('');

    try {
      // Validate required fields
      if (!createForm.email || !createForm.date || !createForm.timeSlot) {
        throw new Error('Please fill in all required fields');
      }

      // Prepare the data for API
      const bookingData = {
        email: createForm.email,
        fullName: createForm.fullName || createForm.email.split('@')[0],
        courtType: createForm.courtType,
        courtNumber: parseInt(createForm.courtNumber),
        date: createForm.date,
        timeSlot: createForm.timeSlot,
        duration: parseInt(createForm.duration),
        phoneNumber: createForm.phoneNumber || '',
        notes: createForm.notes || '',
        paymentStatus: createForm.paymentStatus
      };

      const response = await DashboardFallbacks.withTimeout(
        fetch('https://okz.onrender.com/api/v1/admin/bookings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bookingData)
        }),
        10000
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to create booking');
      }

      // Show success message
      setCreateSuccess(data.message || 'Booking created successfully!');
      
      // Reset form
      setCreateForm({
        email: '',
        fullName: '',
        courtType: 'padel',
        courtNumber: '1',
        date: '',
        timeSlot: '10:00',
        duration: 1,
        phoneNumber: '',
        notes: '',
        paymentStatus: 'paid'
      });

      // Close modal after 2 seconds and refresh data
      setTimeout(() => {
        setShowCreateModal(false);
        setCreateSuccess('');
        fetchOverviewData(true);
      }, 2000);

    } catch (err) {
      console.error('Create booking error:', err);
      setCreateError(err.message || 'Failed to create booking');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateFormChange = (e) => {
    const { name, value } = e.target;
    setCreateForm(prev => ({ ...prev, [name]: value }));
  };

  // Get today's date for min date validation
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Get max date (30 days from now)
  const getMaxDate = () => {
    const max = new Date();
    max.setDate(max.getDate() + 30);
    return max.toISOString().split('T')[0];
  };

  // Generate time slot options (8:00 to 21:00)
  const timeSlots = [];
  for (let hour = 8; hour <= 21; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
  }

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    fetchOverviewData(true);
  };

  const handleViewDetails = (booking) => {
    setSelectedBooking(booking);
    setShowModal(true);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'Anytime';
    try {
      return new Date(timeString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return timeString;
    }
  };

  // Get today's bookings only
  const todayBookings = DashboardFallbacks.extractTodayBookings(overviewData);
  
  // Calculate today's revenue
  const todayRevenue = DashboardFallbacks.calculateRevenue(todayBookings);

  if (loading && !cachedData) {
    return (
      <div className="dashboard-container apple-fade-in">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  if (error && !cachedData) {
    return (
      <div className="dashboard-container apple-fade-in">
        <div className="error-container">
          <div className="error-banner">{error}</div>
          <button onClick={handleRetry} className="retry-button">
            Try Again
          </button>
          <button onClick={() => navigate('/history')} className="quick-action">
            View History Instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container apple-fade-in">
      {/* Offline/Cache indicator */}
      {!DashboardFallbacks.network.isOnline && (
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

      <header>
        <div className="header-left">
          <h1>Welcome back, {user?.email?.split('@')[0] || 'Admin'}</h1>
          <span className="date-today">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </span>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-booking-btn"
            style={{
              background: '#28a745',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#218838'}
            onMouseLeave={(e) => e.target.style.background = '#28a745'}
          >
            + Create Booking
          </button>
          <button onClick={() => navigate('/history')} className="quick-action">
            View Full History →
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="glass-panel stat-card">
          <h3>Today's Revenue</h3>
          <p className="stat-value">
            {formatCurrency(todayRevenue)}
          </p>
          <span className="stat-label">Today's earnings</span>
        </div>
        
        <div className="glass-panel stat-card">
          <h3>Daily Utilization</h3>
          <p className="stat-value">
            {todayBookings.length} <span className="stat-unit">bookings</span>
          </p>
          <span className="stat-label">Occupied today</span>
        </div>
        
        <div className="glass-panel stat-card">
          <h3>Weekly Outlook</h3>
          <p className="stat-value">
            {overviewData?.weeklyOutlook || 0} <span className="stat-unit">bookings</span>
          </p>
          <span className="stat-label">Next 7 days</span>
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="glass-panel live-schedule">
        <div className="schedule-header">
          <h2>Today's Schedule</h2>
          <div className="schedule-controls">
            <span className="schedule-count">
              {todayBookings.length} bookings
            </span>
          </div>
        </div>
        
        <div className="schedule-list detailed">
          {todayBookings.length > 0 ? (
            todayBookings.map((booking) => (
              <div 
                key={booking.id} 
                className={`schedule-card ${booking.status?.toLowerCase() === 'cancelled' ? 'cancelled-card' : ''}`}
                onClick={() => handleViewDetails(booking)}
                style={{
                  opacity: booking.status?.toLowerCase() === 'cancelled' ? 0.7 : 1,
                  textDecoration: booking.status?.toLowerCase() === 'cancelled' ? 'line-through' : 'none'
                }}
              >
                <div className="schedule-card-header">
                  <div className="time-badge">
                    {formatTime(booking.time)}
                  </div>
                  <span className={`status-pill ${booking.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'paid'}`}>
                    {booking.status === 'cancelled' ? 'Cancelled' : 'Paid'}
                  </span>
                </div>
                
                <div className="schedule-card-body">
                  <div className="customer-info-detailed">
                    <span className="customer-name-large">{booking.playerName}</span>
                    {booking.phoneNumber && (
                      <span className="customer-phone">{booking.phoneNumber}</span>
                    )}
                  </div>
                  
                  <div className="booking-details-grid">
                    <div className="detail-item">
                      <span className="detail-label">Court</span>
                      <span className="detail-value">
                        {booking.courtType || 'Padel'} • #{booking.courtNumber}
                      </span>
                    </div>
                    
                    <div className="detail-item">
                      <span className="detail-label">Duration</span>
                      <span className="detail-value">{booking.duration || 1} hour(s)</span>
                    </div>
                    
                    <div className="detail-item">
                      <span className="detail-label">Amount</span>
                      <span className="detail-value price-highlight">
                        {formatCurrency(booking.price)}
                      </span>
                    </div>
                    
                    <div className="detail-item">
                      <span className="detail-label">Payment</span>
                      <span className="detail-value">{booking.paymentMethod || 'Online'}</span>
                    </div>
                  </div>
                  
                  {booking.notes && (
                    <div className="booking-notes">
                      <span className="notes-text">{booking.notes}</span>
                    </div>
                  )}
                </div>
                
                <div className="schedule-card-footer">
                  <span className="booking-id">ID: {booking.id?.slice(-6)}</span>
                  <button className="view-details-btn" onClick={(e) => {
                    e.stopPropagation();
                    handleViewDetails(booking);
                  }}>
                    View Details →
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>No bookings scheduled for today</p>
              <span className="empty-subtext">Check back later</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button 
          className="glass-panel quick-action-btn" 
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(todayBookings, null, 2));
            alert('Today\'s schedule copied to clipboard!');
          }}
        >
          <span className="action-text">Copy Today's Schedule</span>
        </button>
        
        <button 
          className="glass-panel quick-action-btn" 
          onClick={() => navigate('/history')}
        >
          <span className="action-text">Full History</span>
        </button>
        
        <button 
          className="glass-panel quick-action-btn" 
          onClick={handleRetry}
        >
          <span className="action-text">Refresh Data</span>
        </button>
      </div>

      {/* Create Booking Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content create-booking-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h2>Create New Booking</h2>
              <button className="close-modal" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleCreateBooking}>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {createError && (
                  <div style={{
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    color: '#721c24',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '0.85rem'
                  }}>
                    ❌ {createError}
                  </div>
                )}
                
                {createSuccess && (
                  <div style={{
                    backgroundColor: '#d4edda',
                    border: '1px solid #c3e6cb',
                    color: '#155724',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '0.85rem'
                  }}>
                    ✅ {createSuccess}
                  </div>
                )}

                {/* User Information */}
                <div className="detail-section">
                  <h3>Customer Information</h3>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Email *</label>
                    <input
                      type="email"
                      name="email"
                      value={createForm.email}
                      onChange={handleCreateFormChange}
                      required
                      placeholder="customer@example.com"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Full Name</label>
                    <input
                      type="text"
                      name="fullName"
                      value={createForm.fullName}
                      onChange={handleCreateFormChange}
                      placeholder="Leave blank to use email prefix"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Phone Number</label>
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={createForm.phoneNumber}
                      onChange={handleCreateFormChange}
                      placeholder="+201234567890"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                    />
                  </div>
                </div>

                {/* Booking Details */}
                <div className="detail-section">
                  <h3>Booking Details</h3>
                  <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Court Type *</label>
                      <select
                        name="courtType"
                        value={createForm.courtType}
                        onChange={handleCreateFormChange}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                      >
                        <option value="padel">Padel (400 EGP/hour)</option>
                        <option value="tennis">Tennis (150 EGP/hour)</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Court Number *</label>
                      <select
                        name="courtNumber"
                        value={createForm.courtNumber}
                        onChange={handleCreateFormChange}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                      >
                        {createForm.courtType === 'padel' ? (
                          <>
                            <option value="1">Court 1</option>
                            <option value="2">Court 2</option>
                          </>
                        ) : (
                          <>
                            <option value="3">Court 3</option>
                            <option value="4">Court 4</option>
                            <option value="5">Court 5</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Date *</label>
                      <input
                        type="date"
                        name="date"
                        value={createForm.date}
                        onChange={handleCreateFormChange}
                        required
                        min={getMinDate()}
                        max={getMaxDate()}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Time Slot *</label>
                      <select
                        name="timeSlot"
                        value={createForm.timeSlot}
                        onChange={handleCreateFormChange}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                      >
                        {timeSlots.map(slot => (
                          <option key={slot} value={slot}>{slot}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Duration (hours) *</label>
                      <select
                        name="duration"
                        value={createForm.duration}
                        onChange={handleCreateFormChange}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                      >
                        <option value={1}>1 hour</option>
                        <option value={2}>2 hours</option>
                        <option value={3}>3 hours</option>
                        <option value={4}>4 hours</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Payment Status</label>
                      <select
                        name="paymentStatus"
                        value={createForm.paymentStatus}
                        onChange={handleCreateFormChange}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                      >
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Notes</label>
                    <textarea
                      name="notes"
                      value={createForm.notes}
                      onChange={handleCreateFormChange}
                      placeholder="Any special requests or notes..."
                      rows="3"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', resize: 'vertical' }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '12px', padding: '10px', background: '#f8f9fa', borderRadius: '6px' }}>
                  <span>ℹ️ If the user doesn't exist, they will be automatically created with a random password.</span>
                </div>
              </div>
              
              <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', padding: '16px', borderTop: '1px solid #eee' }}>
                <button 
                  type="button" 
                  className="modal-btn secondary" 
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="modal-btn primary"
                  disabled={createLoading}
                  style={{ 
                    padding: '10px 24px', 
                    borderRadius: '6px', 
                    border: 'none', 
                    background: '#28a745', 
                    color: 'white', 
                    cursor: createLoading ? 'not-allowed' : 'pointer',
                    opacity: createLoading ? 0.7 : 1
                  }}
                >
                  {createLoading ? 'Creating...' : 'Create Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <h3>Customer Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Name:</span>
                    <span className="detail-value">{selectedBooking.playerName}</span>
                  </div>
                  {selectedBooking.phoneNumber && (
                    <div className="detail-item">
                      <span className="detail-label">Phone:</span>
                      <span className="detail-value">{selectedBooking.phoneNumber}</span>
                    </div>
                  )}
                  {selectedBooking.email && (
                    <div className="detail-item">
                      <span className="detail-label">Email:</span>
                      <span className="detail-value">{selectedBooking.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h3>Booking Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Court:</span>
                    <span className="detail-value">
                      {selectedBooking.courtType || 'Padel'} #{selectedBooking.courtNumber}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Date:</span>
                    <span className="detail-value">
                      {new Date().toLocaleDateString()}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Time:</span>
                    <span className="detail-value">{formatTime(selectedBooking.time)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Duration:</span>
                    <span className="detail-value">{selectedBooking.duration || 1} hour(s)</span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Payment Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Amount:</span>
                    <span className="detail-value price-large">
                      {formatCurrency(selectedBooking.price)}
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
                  <div className="notes-box">{selectedBooking.notes}</div>
                </div>
              )}

              <div className="detail-section">
                <h3>Booking ID</h3>
                <code className="booking-id-full">{selectedBooking.id}</code>
              </div>
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

export default Dashboard;