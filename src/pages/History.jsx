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
  
  // NEW: View tabs
  const [activeView, setActiveView] = useState('today'); // 'today', 'upcoming', 'past', 'all'
  
  const navigate = useNavigate();

  // ===== FALLBACKS - Isolated inline =====
  const HistoryFallbacks = {
    // Date categorization
    categorizeBookings: (bookings) => {
      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);
      
      return {
        today: bookings.filter(b => {
          const bookingDate = new Date(b.date);
          return bookingDate >= today && bookingDate <= endOfToday;
        }),
        upcoming: bookings.filter(b => {
          const bookingDate = new Date(b.date);
          return bookingDate > endOfToday;
        }),
        past: bookings.filter(b => {
          const bookingDate = new Date(b.date);
          return bookingDate < today;
        })
      };
    },
    
    // Simple revenue calculation (all bookings considered paid)
    calculateRevenue: (bookings) => {
      return bookings.reduce((sum, b) => {
        // Use price or revenue field, default to 400 for padel, 150 for tennis
        const amount = b.price || b.revenue || (b.courtType?.toLowerCase() === 'padel' ? 400 : 150);
        return sum + (b.status?.toLowerCase() === 'cancelled' ? 0 : amount);
      }, 0);
    },
    
    // Cache for offline support
    cache: {
      save: (key, data) => {
        try {
          localStorage.setItem(`history_${key}`, JSON.stringify({
            data,
            timestamp: Date.now()
          }));
        } catch (e) {}
      },
      
      load: (key, maxAge = 300000) => { // 5 minutes default
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
      }
    },
    
    // Payment simplification - all bookings are considered paid unless cancelled
    simplifyPayment: (booking) => {
      return {
        ...booking,
        paymentStatus: booking.status?.toLowerCase() === 'cancelled' ? 'refunded' : 'paid',
        revenue: booking.price || booking.revenue || (booking.courtType?.toLowerCase() === 'padel' ? 400 : 150)
      };
    }
  };
  // ===== END FALLBACKS =====

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Try cache first
      const cached = HistoryFallbacks.cache.load('all');
      if (cached) {
        setBookings(cached.map(HistoryFallbacks.simplifyPayment));
        setFilteredBookings(cached.map(HistoryFallbacks.simplifyPayment));
        setLoading(false);
        // Still fetch in background
      }

      const response = await fetch('https://okz.onrender.com/api/v1/admin/history', {
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
        throw new Error(`Failed to fetch history (${response.status})`);
      }
      
      const data = await response.json();
      
      // Simplify payment data - all bookings considered paid unless cancelled
      const simplifiedData = data.map(HistoryFallbacks.simplifyPayment);
      
      setBookings(simplifiedData);
      
      // Apply current view filter
      applyViewFilter(simplifiedData, activeView);
      
      // Save to cache
      HistoryFallbacks.cache.save('all', simplifiedData);
      
    } catch (err) {
      console.error('History fetch error:', err);
      setError(err.message);
      
      // If we have cached data, use it
      const cached = HistoryFallbacks.cache.load('all', 86400000); // 24 hours for error fallback
      if (cached) {
        setBookings(cached.map(HistoryFallbacks.simplifyPayment));
        applyViewFilter(cached.map(HistoryFallbacks.simplifyPayment), activeView);
      }
    } finally {
      setLoading(false);
    }
  };

  // Apply view filter (today, upcoming, past, all)
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

  useEffect(() => {
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
        // all - keep as is
        break;
    }

    // Then apply search
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

    // Status filter (simplified - only cancelled matters)
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

  // Calculate revenue - cancelled bookings don't count
  const totalRevenue = filteredBookings.reduce((sum, b) => {
    if (b.status?.toLowerCase() === 'cancelled') return sum;
    return sum + (b.price || b.revenue || (b.courtType?.toLowerCase() === 'padel' ? 400 : 150));
  }, 0);
  
  const uniquePlayers = new Set(filteredBookings.map(b => b.customerName)).size;
  const averageBookingValue = filteredBookings.length > 0 
    ? totalRevenue / filteredBookings.filter(b => b.status?.toLowerCase() !== 'cancelled').length 
    : 0;

  // Get counts for each category
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
          <button onClick={() => fetchHistory()} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container apple-fade-in">
      <header className="history-header">
        <div className="header-left">
          <button onClick={() => navigate('/dashboard')} className="back-button">
            ← Back to Dashboard
          </button>
          <h1>Booking History</h1>
        </div>
        <div className="header-right">
          <button 
            className="filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </header>

      {/* NEW: View Tabs */}
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
            fontWeight: activeView === 'today' ? '600' : '400',
            position: 'relative'
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
        <button
          onClick={() => setActiveView('all')}
          className={`view-tab ${activeView === 'all' ? 'active' : ''}`}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: 'none',
            background: activeView === 'all' ? '#0071e3' : 'transparent',
            color: activeView === 'all' ? 'white' : '#666',
            cursor: 'pointer',
            fontWeight: activeView === 'all' ? '600' : '400'
          }}
        >
          All Time ({bookings.length})
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
                    <p>
                      {searchTerm || dateRange.start || dateRange.end || courtFilter !== 'all' || statusFilter !== 'all'
                        ? 'No bookings match your filters' 
                        : `No ${activeView !== 'all' ? activeView : ''} bookings available`}
                    </p>
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