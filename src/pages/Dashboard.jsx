import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Dashboard.css';

const Dashboard = ({ user }) => {
  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activeView, setActiveView] = useState('today'); // 'today', 'upcoming', 'past'
  const [cachedData, setCachedData] = useState(null);
  
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
      
      load: (key, maxAge = 300000) => { // 5 minutes default
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
      }
    },

    // Separate bookings into categories
    categorizeBookings: (schedule) => {
      if (!schedule || !Array.isArray(schedule)) {
        return { today: [], upcoming: [], past: [] };
      }

      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      return {
        today: schedule.filter(b => {
          const bookingDate = new Date(b.date || b.time);
          return bookingDate >= today && bookingDate <= endOfToday;
        }),
        upcoming: schedule.filter(b => {
          const bookingDate = new Date(b.date || b.time);
          return bookingDate > endOfToday;
        }),
        past: schedule.filter(b => {
          const bookingDate = new Date(b.date || b.time);
          return bookingDate < today;
        })
      };
    },

    // Calculate revenue (cancelled bookings = 0)
    calculateRevenue: (bookings) => {
      return bookings.reduce((sum, b) => {
        if (b.status?.toLowerCase() === 'cancelled') return sum;
        return sum + (b.price || b.revenue || 0);
      }, 0);
    },

    // Simplify payment status
    simplifyPayment: (booking) => {
      return {
        ...booking,
        paymentStatus: booking.status?.toLowerCase() === 'cancelled' ? 'refunded' : 'paid',
        displayStatus: booking.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'paid'
      };
    },

    // Retry with backoff
    async retry(fn, maxRetries = 2) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (err) {
          if (i === maxRetries - 1) throw err;
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
      }
    },

    // Network status
    network: {
      isOnline: navigator.onLine,
      init() {
        window.addEventListener('online', () => { this.isOnline = true; });
        window.addEventListener('offline', () => { this.isOnline = false; });
      }
    }
  };

  // Initialize
  DashboardFallbacks.network.init();
  // ===== END FALLBACKS =====

  const fetchOverviewData = async (retry = true) => {
    try {
      setLoading(true);
      setError('');
      
      // Try cache first if offline
      if (!DashboardFallbacks.network.isOnline) {
        const cached = DashboardFallbacks.cache.load('overview', 3600000); // 1 hour for offline
        if (cached) {
          setOverviewData(cached);
          setCachedData(cached);
          setLoading(false);
          return;
        }
      }

      const fetchFn = async () => {
        const response = await fetch('https://okz.onrender.com/api/v1/admin/overview', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
            'Content-Type': 'application/json'
          }
        });
        
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

      const data = retry 
        ? await DashboardFallbacks.retry(fetchFn)
        : await fetchFn();
      
      // Ensure each booking has a price (default based on court type)
      if (data.todaySchedule) {
        data.todaySchedule = data.todaySchedule.map(booking => ({
          ...booking,
          price: booking.price || booking.revenue || (booking.courtType?.toLowerCase() === 'padel' ? 400 : 150),
          displayStatus: booking.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'paid'
        }));
      }
      
      setOverviewData(data);
      setCachedData(data);
      
      // Save to cache
      DashboardFallbacks.cache.save('overview', data);
      
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      
      // Try cache as fallback
      const cached = DashboardFallbacks.cache.load('overview', 86400000); // 24 hours for error fallback
      if (cached) {
        setOverviewData(cached);
        setCachedData(cached);
        setError('Using cached data - ' + err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const handleRetry = () => {
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

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Categorize bookings
  const categorized = DashboardFallbacks.categorizeBookings(overviewData?.todaySchedule);
  
  // Calculate revenue based on active view
  const getDisplayRevenue = () => {
    switch(activeView) {
      case 'today':
        return DashboardFallbacks.calculateRevenue(categorized.today);
      case 'upcoming':
        return DashboardFallbacks.calculateRevenue(categorized.upcoming);
      case 'past':
        return DashboardFallbacks.calculateRevenue(categorized.past);
      default:
        return overviewData?.dailyRevenue || 0;
    }
  };

  // Get current display bookings
  const getDisplayBookings = () => {
    switch(activeView) {
      case 'today':
        return categorized.today;
      case 'upcoming':
        return categorized.upcoming;
      case 'past':
        return categorized.past;
      default:
        return overviewData?.todaySchedule || [];
    }
  };

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

  const displayBookings = getDisplayBookings();
  const displayRevenue = getDisplayRevenue();

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
        <button onClick={() => navigate('/history')} className="quick-action">
          View Full History →
        </button>
      </header>

      {/* View Tabs */}
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
          Upcoming ({categorized.upcoming.length})
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
          Past ({categorized.past.length})
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="glass-panel stat-card">
          <h3>{activeView === 'today' ? "Today's" : activeView === 'upcoming' ? 'Upcoming' : 'Past'} Revenue</h3>
          <p className="stat-value">
            {formatCurrency(displayRevenue)}
          </p>
          <span className="stat-label">
            {activeView === 'today' ? "Today's earnings" : 
             activeView === 'upcoming' ? 'Future bookings' : 
             'Completed bookings'}
          </span>
        </div>
        
        <div className="glass-panel stat-card">
          <h3>{activeView === 'today' ? 'Daily' : activeView === 'upcoming' ? 'Upcoming' : 'Past'} Utilization</h3>
          <p className="stat-value">
            {displayBookings.length} <span className="stat-unit">bookings</span>
          </p>
          <span className="stat-label">
            {activeView === 'today' ? 'Occupied today' : 
             activeView === 'upcoming' ? 'Scheduled' : 
             'Completed'}
          </span>
        </div>
        
        <div className="glass-panel stat-card">
          <h3>Weekly Outlook</h3>
          <p className="stat-value">
            {overviewData?.weeklyOutlook || 0} <span className="stat-unit">bookings</span>
          </p>
          <span className="stat-label">Next 7 days</span>
        </div>
      </div>

      {/* Live Schedule */}
      <div className="glass-panel live-schedule">
        <div className="schedule-header">
          <h2>
            {activeView === 'today' ? "Today's Schedule" : 
             activeView === 'upcoming' ? 'Upcoming Bookings' : 
             'Past Bookings'}
          </h2>
          <div className="schedule-controls">
            <span className="schedule-count">
              {displayBookings.length} bookings
            </span>
          </div>
        </div>
        
        <div className="schedule-list detailed">
          {displayBookings.length > 0 ? (
            displayBookings.map((booking) => (
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
                    {activeView === 'past' ? formatDate(booking.date) : formatTime(booking.time)}
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
              <p>No {activeView} bookings found</p>
              <span className="empty-subtext">
                {activeView === 'today' ? 'Check back later' : 
                 activeView === 'upcoming' ? 'No future bookings scheduled' : 
                 'No past bookings available'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button 
          className="glass-panel quick-action-btn" 
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(displayBookings, null, 2));
            alert(`${activeView} schedule copied to clipboard!`);
          }}
        >
          <span className="action-text">Copy {activeView} Schedule</span>
        </button>
        
        <button 
          className="glass-panel quick-action-btn" 
          onClick={() => navigate('/history')}
        >
          <span className="action-text">Full History</span>
        </button>
        
        <button 
          className="glass-panel quick-action-btn" 
          onClick={() => fetchOverviewData()}
        >
          <span className="action-text">Refresh Data</span>
        </button>
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
                      {formatDate(selectedBooking.date) || new Date().toLocaleDateString()}
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