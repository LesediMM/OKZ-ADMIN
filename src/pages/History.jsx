// src/pages/History.jsx
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
  const navigate = useNavigate();

  // Fetch history data
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

  // Filter bookings based on search term and date range
  useEffect(() => {
    const filterBookings = () => {
      let filtered = [...bookings];

      // Apply search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(booking => 
          booking.customerName?.toLowerCase().includes(term) ||
          booking.phoneNumber?.toLowerCase().includes(term) ||
          booking.email?.toLowerCase().includes(term) ||
          booking.courtType?.toLowerCase().includes(term) ||
          booking.id?.toString().includes(term)
        );
      }

      // Apply date range filter
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

      setFilteredBookings(filtered);
    };

    filterBookings();
  }, [searchTerm, bookings, dateRange]);

  // Sort function
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    
    const sorted = [...filteredBookings].sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];
      
      // Handle date sorting
      if (key === 'date') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      // Handle revenue sorting as number
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

  // Format date for display
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

  // Get court icon
  const getCourtIcon = (courtType) => {
    switch(courtType?.toLowerCase()) {
      case 'padel': return '🎾';
      case 'tennis': return '🏸';
      default: return '🏟️';
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Customer', 'Phone', 'Email', 'Court Type', 'Revenue', 'Status'];
    const csvData = filteredBookings.map(booking => [
      formatDate(booking.date),
      booking.customerName,
      booking.phoneNumber,
      booking.email || '',
      booking.courtType,
      booking.revenue?.toFixed(2) || '0.00',
      booking.status || 'Paid'
    ]);
    
    const csvContent = [headers, ...csvData]
      .map(row => row.join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Print report
  const printReport = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Booking History Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #667eea; color: white; padding: 10px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            .total { margin-top: 20px; font-size: 1.2em; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Booking History Report</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <p>Total Bookings: ${filteredBookings.length}</p>
          <p>Total Revenue: $${filteredBookings.reduce((sum, b) => sum + (b.revenue || 0), 0).toFixed(2)}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Contact</th>
                <th>Court</th>
                <th>Revenue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredBookings.map(booking => `
                <tr>
                  <td>${formatDate(booking.date)}</td>
                  <td>${booking.customerName}</td>
                  <td>${booking.phoneNumber}${booking.email ? '<br>' + booking.email : ''}</td>
                  <td>${booking.courtType}</td>
                  <td>$${(booking.revenue || 0).toFixed(2)}</td>
                  <td>${booking.status || 'Paid'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Calculate totals
  const totalRevenue = filteredBookings.reduce((sum, b) => sum + (b.revenue || 0), 0);
  const uniquePlayers = new Set(filteredBookings.map(b => b.customerName)).size;

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
            {showFilters ? 'Hide Filters 🔍' : 'Show Filters 🔍'}
          </button>
        </div>
      </header>

      {/* Search and Filters */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by name, phone, email..."
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
          <div className="date-filters glass-panel">
            <div className="filter-group">
              <label>From:</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              />
            </div>
            <div className="filter-group">
              <label>To:</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              />
            </div>
            <button 
              className="clear-filters"
              onClick={() => {
                setDateRange({ start: '', end: '' });
                setSearchTerm('');
              }}
            >
              Clear Filters
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
          <p className="stat-value">${totalRevenue.toFixed(2)}</p>
        </div>
        <div className="glass-panel stat-card small">
          <h3>Unique Players</h3>
          <p className="stat-value">{uniquePlayers}</p>
        </div>
      </div>

      {/* History Table */}
      <div className="glass-panel history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th onClick={() => requestSort('date')} className="sortable">
                Date/Time {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('customerName')} className="sortable">
                Customer {sortConfig.key === 'customerName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th>Contact</th>
              <th onClick={() => requestSort('courtType')} className="sortable">
                Court Type {sortConfig.key === 'courtType' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('revenue')} className="sortable">
                Revenue {sortConfig.key === 'revenue' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.length > 0 ? (
              filteredBookings.map((booking) => (
                <tr key={booking.id} className="booking-row">
                  <td>{formatDate(booking.date)}</td>
                  <td>
                    <div className="customer-info">
                      <span className="customer-name">{booking.customerName}</span>
                      {booking.notes && <span className="customer-note">{booking.notes}</span>}
                    </div>
                  </td>
                  <td>
                    <div className="contact-info">
                      <span>{booking.phoneNumber}</span>
                      {booking.email && <span className="email-small">{booking.email}</span>}
                    </div>
                  </td>
                  <td>
                    <span className="court-type-badge">
                      {getCourtIcon(booking.courtType)} {booking.courtType}
                    </span>
                  </td>
                  <td className="revenue">${booking.revenue?.toFixed(2)}</td>
                  <td>
                    <span className={`status-pill ${booking.status?.toLowerCase() || 'paid'}`}>
                      {booking.status || 'Paid'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="no-results">
                  {searchTerm || dateRange.start || dateRange.end 
                    ? 'No bookings match your filters' 
                    : 'No booking history available'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Export Options */}
      <div className="export-actions">
        <button 
          className="glass-panel export-btn" 
          onClick={exportToCSV}
          disabled={filteredBookings.length === 0}
        >
          📥 Export as CSV
        </button>
        <button 
          className="glass-panel export-btn" 
          onClick={printReport}
          disabled={filteredBookings.length === 0}
        >
          🖨️ Print Report
        </button>
        <button 
          className="glass-panel export-btn" 
          onClick={fetchHistory}
        >
          🔄 Refresh Data
        </button>
      </div>
    </div>
  );
};

export default History;