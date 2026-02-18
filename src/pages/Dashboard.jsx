// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Dashboard.css';

const Dashboard = ({ user }) => {
  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
          // Unauthorized - redirect to login
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

  // Handle retry on error
  const handleRetry = () => {
    fetchOverviewData();
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
            ${overviewData?.dailyRevenue?.toFixed(2) || '0.00'}
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
          <span className="schedule-count">
            {overviewData?.todaySchedule?.length || 0} bookings
          </span>
        </div>
        
        <div className="schedule-list">
          {overviewData?.todaySchedule?.length > 0 ? (
            overviewData.todaySchedule.map((booking) => (
              <div key={booking.id} className="schedule-item">
                <div className="schedule-item-info">
                  <span className="player-name">{booking.playerName}</span>
                  <span className="court-info">
                    <span className="court-badge">Court {booking.courtNumber}</span>
                    <span className="booking-time">{booking.time || 'Anytime'}</span>
                  </span>
                </div>
                <span className={`status-pill ${booking.status?.toLowerCase() || 'confirmed'}`}>
                  {booking.status || 'Confirmed'}
                </span>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>No bookings scheduled for today</p>
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
          <span className="action-icon">📋</span>
          <span className="action-text">Copy Schedule</span>
        </button>
        
        <button 
          className="glass-panel quick-action-btn" 
          onClick={() => navigate('/history')}
        >
          <span className="action-icon">📊</span>
          <span className="action-text">Full History</span>
        </button>
        
        <button 
          className="glass-panel quick-action-btn" 
          onClick={() => fetchOverviewData()}
        >
          <span className="action-icon">🔄</span>
          <span className="action-text">Refresh Data</span>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;