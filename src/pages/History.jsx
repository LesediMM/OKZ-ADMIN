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
  const navigate = useNavigate();

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError('');
      
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
      setBookings(data);
      setFilteredBookings(data);
    } catch (err) {
      console.error('History fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    let filtered = [...bookings];

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

    if (courtFilter !== 'all') {
      filtered = filtered.filter(booking => 
        booking.courtType?.toLowerCase() === courtFilter.toLowerCase()
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(booking => 
        booking.status?.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    setFilteredBookings(filtered);
  }, [searchTerm, bookings, dateRange, courtFilter, statusFilter]);

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
      
      if (key === 'revenue') {
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

  const exportToCSV = () => {
    const headers = [
      'Date', 'Time', 'Customer', 'Phone', 'Email', 
      'Court Type', 'Court #', 'Duration', 'Revenue', 
      'Status', 'Payment Method', 'Notes', 'Booking ID'
    ];
    
    const csvData = filteredBookings.map(booking => [
      formatDate(booking.date).split(',')[0],
      formatDate(booking.date).split(',')[1]?.trim() || 'N/A',
      booking.customerName,
      booking.phoneNumber || 'N/A',
      booking.email || 'N/A',
      booking.courtType || 'Padel',
      booking.courtNumber || '1',
      `${booking.duration || 1} hour(s)`,
      booking.revenue?.toFixed(2) || '0.00',
      booking.status || 'paid',
      booking.paymentMethod || 'Online',
      booking.notes || '',
      booking.id
    ]);
    
    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const printReport = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>OKZ Sports - Booking History Report</title>
          <style>
            body { font-family: 'Inter', Arial, sans-serif; padding: 30px; background: #f5f5f7; }
            .report-header { text-align: center; margin-bottom: 30px; }
            h1 { color: #1d1d1f; margin-bottom: 5px; }
            .summary-cards { display: flex; gap: 20px; margin: 20px 0; }
            .summary-card { 
              background: white; 
              padding: 20px; 
              border-radius: 16px; 
              flex: 1;
              box-shadow: 0 2px 8px rgba(0,0,0,0.02);
            }
            .summary-card h3 { color: #86868b; font-size: 0.9rem; margin-bottom: 10px; }
            .summary-card .value { font-size: 1.8rem; font-weight: bold; color: #1d1d1f; }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 30px; 
              background: white;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 12px rgba(0,0,0,0.02);
            }
            th { 
              background: #0071e3; 
              color: white; 
              padding: 12px; 
              text-align: left;
              font-weight: 500;
            }
            td { 
              padding: 12px; 
              border-bottom: 1px solid #f5f5f7;
            }
            .footer { 
              margin-top: 30px; 
              text-align: right; 
              color: #86868b;
              font-size: 0.9rem;
            }
          </style>
        </head>
        <body>
          <div class="report-header">
            <h1>OKZ Sports - Booking History Report</h1>
            <p>Generated: ${new Date().toLocaleString()}</p>
          </div>
          
          <div class="summary-cards">
            <div class="summary-card">
              <h3>Total Bookings</h3>
              <div class="value">${filteredBookings.length}</div>
            </div>
            <div class="summary-card">
              <h3>Total Revenue</h3>
              <div class="value">${formatCurrency(filteredBookings.reduce((sum, b) => sum + (b.revenue || 0), 0))}</div>
            </div>
            <div class="summary-card">
              <h3>Unique Players</h3>
              <div class="value">${new Set(filteredBookings.map(b => b.customerName)).size}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>Court</th>
                <th>Duration</th>
                <th>Revenue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredBookings.map(booking => `
                <tr>
                  <td>${formatDate(booking.date)}</td>
                  <td>
                    <strong>${booking.customerName}</strong><br>
                    <small>${booking.phoneNumber || ''}</small>
                  </td>
                  <td>${booking.courtType || 'Padel'} #${booking.courtNumber || '1'}</td>
                  <td>${booking.duration || 1} hour(s)</td>
                  <td><strong>${formatCurrency(booking.revenue)}</strong></td>
                  <td><span class="status-pill ${booking.status?.toLowerCase() || 'paid'}">${booking.status || 'Paid'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            <p>Report generated by OKZ Admin Portal</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const totalRevenue = filteredBookings.reduce((sum, b) => sum + (b.revenue || 0), 0);
  const uniquePlayers = new Set(filteredBookings.map(b => b.customerName)).size;
  const averageBookingValue = filteredBookings.length > 0 ? totalRevenue / filteredBookings.length : 0;

  if (loading) {
    return (
      <div className="dashboard-container apple-fade-in">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading history...</p>
        </div>
      </div>
    );
  }

  if (error) {
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
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
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
            {filteredBookings.length !== bookings.length && 
              `filtered from ${bookings.length}`}
          </span>
        </div>
        <div className="glass-panel stat-card small">
          <h3>Total Revenue</h3>
          <p className="stat-value">{formatCurrency(totalRevenue)}</p>
          <span className="stat-label">All time</span>
        </div>
        <div className="glass-panel stat-card small">
          <h3>Unique Players</h3>
          <p className="stat-value">{uniquePlayers}</p>
          <span className="stat-label">Active customers</span>
        </div>
        <div className="glass-panel stat-card small">
          <h3>Avg. Booking</h3>
          <p className="stat-value">{formatCurrency(averageBookingValue)}</p>
          <span className="stat-label">Per booking</span>
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
              <th onClick={() => requestSort('revenue')} className="sortable">
                Revenue {sortConfig.key === 'revenue' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th>Payment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.length > 0 ? (
              filteredBookings.map((booking) => (
                <tr 
                  key={booking.id} 
                  className="booking-row clickable"
                  onClick={() => handleRowClick(booking)}
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
                    <span className="revenue-amount">{formatCurrency(booking.revenue)}</span>
                  </td>
                  <td>
                    <span className="payment-method">
                      {booking.paymentMethod || 'Online'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${booking.status?.toLowerCase() || 'paid'}`}>
                      {booking.status || 'Paid'}
                    </span>
                  </td>
                  <td>
                    <button 
                      className="view-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(booking);
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="no-results">
                  <div className="empty-state">
                    <p>
                      {searchTerm || dateRange.start || dateRange.end || courtFilter !== 'all' || statusFilter !== 'all'
                        ? 'No bookings match your filters' 
                        : 'No booking history available'}
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

      {/* Export Options */}
      <div className="export-actions">
        <div className="export-stats">
          <span>Showing {filteredBookings.length} of {bookings.length} bookings</span>
        </div>
        <div className="export-buttons">
          <button 
            className="glass-panel export-btn" 
            onClick={exportToCSV}
            disabled={filteredBookings.length === 0}
          >
            Export as CSV
          </button>
          <button 
            className="glass-panel export-btn" 
            onClick={printReport}
            disabled={filteredBookings.length === 0}
          >
            Print Report
          </button>
          <button 
            className="glass-panel export-btn" 
            onClick={fetchHistory}
          >
            Refresh Data
          </button>
        </div>
      </div>

      {/* Booking Details Modal */}
      {showModal && selectedBooking && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content glass-panel large" onClick={(e) => e.stopPropagation()}>
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
                    <span className="detail-value price-large">{formatCurrency(selectedBooking.revenue)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Payment Method:</span>
                    <span className="detail-value">{selectedBooking.paymentMethod || 'Online'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status:</span>
                    <span className={`status-pill ${selectedBooking.status?.toLowerCase() || 'paid'}`}>
                      {selectedBooking.status || 'Paid'}
                    </span>
                  </div>
                </div>
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
              <button className="modal-btn primary" onClick={() => setShowModal(false)}>
                Mark as Actioned
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;