import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Dashboard.css';

const Dashboard = ({ user }) => {
  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const fetchOverviewData = async () => {
    try {
      setLoading(true);
      setError('');
      
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
      
      const data = await response.json();
      setOverviewData(data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const handleRetry = () => {
    fetchOverviewData();
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

  if (loading) {
    return (
      <div className="dashboard-container apple-fade-in">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
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
          View History →
        </button>
      </header>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="glass-panel stat-card">
          <h3>Daily Revenue</h3>
          <p className="stat-value">
            {formatCurrency(overviewData?.dailyRevenue)}
          </p>
          <span className="stat-label">Today's earnings</span>
        </div>
        
        <div className="glass-panel stat-card">
          <h3>Daily Utilization</h3>
          <p className="stat-value">
            {overviewData?.dailyUtilization || 0} <span className="stat-unit">slots</span>
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

      {/* Live Schedule */}
      <div className="glass-panel live-schedule">
        <div className="schedule-header">
          <h2>Today's Schedule</h2>
          <div className="schedule-controls">
            <span className="schedule-count">
              {overviewData?.todaySchedule?.length || 0} bookings
            </span>
          </div>
        </div>
        
        <div className="schedule-list detailed">
          {overviewData?.todaySchedule?.length > 0 ? (
            overviewData.todaySchedule.map((booking) => (
              <div key={booking.id} className="schedule-card" onClick={() => handleViewDetails(booking)}>
                <div className="schedule-card-header">
                  <div className="time-badge">{formatTime(booking.time)}</div>
                  <span className={`status-pill ${booking.status?.toLowerCase() || 'confirmed'}`}>
                    {booking.status || 'Confirmed'}
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
                        {formatCurrency(booking.revenue)}
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
              <span className="empty-subtext">Check back later or view history</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button 
          className="glass-panel quick-action-btn" 
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(overviewData?.todaySchedule, null, 2));
            alert('Schedule copied to clipboard!');
          }}
        >
          <span className="action-text">Copy Schedule</span>
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
                    <span className="detail-value">{new Date().toLocaleDateString()}</span>
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
                    <span className="detail-value price-large">{formatCurrency(selectedBooking.revenue)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status:</span>
                    <span className={`status-pill ${selectedBooking.status?.toLowerCase() || 'confirmed'}`}>
                      {selectedBooking.status || 'Confirmed'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Method:</span>
                    <span className="detail-value">{selectedBooking.paymentMethod || 'Online'}</span>
                  </div>
                </div>
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