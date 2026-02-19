// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import History from './pages/History';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('adminEmail') !== null && 
                          localStorage.getItem('adminToken') !== null;
  
  if (!isAuthenticated) {
    // Clear any partial session data
    localStorage.removeItem('adminEmail');
    localStorage.removeItem('adminToken');
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on app load
  useEffect(() => {
    const adminEmail = localStorage.getItem('adminEmail');
    const adminToken = localStorage.getItem('adminToken');
    
    if (adminEmail && adminToken) {
      setUser({ email: adminEmail });
    }
    setLoading(false);
  }, []);

  // Show nothing while checking authentication
  if (loading) {
    return null; // or a minimal loading spinner if you prefer
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={<Login setUser={setUser} />} 
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
        <Route 
          path="/" 
          element={<Navigate to="/dashboard" replace />} 
        />
        {/* Catch all other routes - redirect to dashboard or login */}
        <Route 
          path="*" 
          element={<Navigate to="/dashboard" replace />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;