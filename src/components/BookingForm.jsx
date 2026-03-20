// src/components/BookingForm.jsx
import { useState, useEffect } from 'react';

const BookingForm = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  editMode = false,
  initialData = null 
}) => {
  // Form state
  const [formData, setFormData] = useState({
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
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Available time slots (8:00 to 21:00)
  const timeSlots = [];
  for (let hour = 8; hour <= 21; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
  }
  
  // Duration options
  const durationOptions = [1, 2, 3, 4];
  
  // Payment status options
  const paymentOptions = [
    { value: 'paid', label: 'Paid' },
    { value: 'pending', label: 'Pending' }
  ];
  
  // Court type options
  const courtTypeOptions = [
    { value: 'padel', label: 'Padel', price: 400 },
    { value: 'tennis', label: 'Tennis', price: 150 }
  ];
  
  // Get court number options based on court type
  const getCourtNumberOptions = () => {
    if (formData.courtType === 'padel') {
      return [
        { value: '1', label: 'Court 1' },
        { value: '2', label: 'Court 2' }
      ];
    } else {
      return [
        { value: '3', label: 'Court 3' },
        { value: '4', label: 'Court 4' },
        { value: '5', label: 'Court 5' }
      ];
    }
  };
  
  // Get minimum date (today)
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };
  
  // Get maximum date (30 days from now)
  const getMaxDate = () => {
    const max = new Date();
    max.setDate(max.getDate() + 30);
    return max.toISOString().split('T')[0];
  };
  
  // Calculate total price based on court type and duration
  const calculateTotalPrice = () => {
    const courtType = courtTypeOptions.find(ct => ct.value === formData.courtType);
    const pricePerHour = courtType?.price || 400;
    return pricePerHour * formData.duration;
  };
  
  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error when user starts typing
    if (error) setError('');
  };
  
  // Handle court type change (reset court number to first available)
  const handleCourtTypeChange = (e) => {
    const newCourtType = e.target.value;
    const newCourtNumber = newCourtType === 'padel' ? '1' : '3';
    
    setFormData(prev => ({
      ...prev,
      courtType: newCourtType,
      courtNumber: newCourtNumber
    }));
    
    if (error) setError('');
  };
  
  // Validate form before submission
  const validateForm = () => {
    // Email validation
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!formData.email || !emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }
    
    // Date validation
    if (!formData.date) {
      setError('Please select a date');
      return false;
    }
    
    const selectedDate = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      setError('Cannot create booking in the past');
      return false;
    }
    
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    if (selectedDate > maxDate) {
      setError('Cannot book more than 30 days in advance');
      return false;
    }
    
    // Time slot validation
    if (!formData.timeSlot) {
      setError('Please select a time slot');
      return false;
    }
    
    // Phone number validation (optional but format check)
    if (formData.phoneNumber) {
      const phoneRegex = /^[0-9+\s-]{8,15}$/;
      if (!phoneRegex.test(formData.phoneNumber)) {
        setError('Please enter a valid phone number (8-15 digits, +, spaces, hyphens allowed)');
        return false;
      }
    }
    
    return true;
  };
  
  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // Prepare data for API
      const bookingData = {
        email: formData.email,
        fullName: formData.fullName || formData.email.split('@')[0],
        courtType: formData.courtType,
        courtNumber: parseInt(formData.courtNumber),
        date: formData.date,
        timeSlot: formData.timeSlot,
        duration: parseInt(formData.duration),
        phoneNumber: formData.phoneNumber || '',
        notes: formData.notes || '',
        paymentStatus: formData.paymentStatus
      };
      
      // API endpoint
      const url = 'https://okz.onrender.com/api/v1/admin/bookings';
      
      // Make request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bookingData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to create booking');
      }
      
      // Show success message
      setSuccess(data.message || 'Booking created successfully!');
      
      // Reset form
      setFormData({
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
      
      // Call onSuccess callback after 1.5 seconds
      setTimeout(() => {
        if (onSuccess) onSuccess(data);
        if (onClose) onClose();
      }, 1500);
      
    } catch (err) {
      console.error('Booking form error:', err);
      
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else if (err.message.includes('401')) {
        setError('Session expired. Please login again.');
        // Redirect to login after 2 seconds
        setTimeout(() => {
          localStorage.removeItem('adminToken');
          localStorage.removeItem('adminEmail');
          window.location.href = '/login';
        }, 2000);
      } else {
        setError(err.message || 'Failed to create booking. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Reset form when modal closes
  const handleClose = () => {
    if (!loading) {
      setFormData({
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
      setError('');
      setSuccess('');
      onClose();
    }
  };
  
  // Populate form with initial data if in edit mode
  useEffect(() => {
    if (editMode && initialData) {
      setFormData({
        email: initialData.email || '',
        fullName: initialData.fullName || initialData.playerName || '',
        courtType: initialData.courtType?.toLowerCase() || 'padel',
        courtNumber: String(initialData.courtNumber || 1),
        date: initialData.date ? new Date(initialData.date).toISOString().split('T')[0] : '',
        timeSlot: initialData.timeSlot || initialData.time || '10:00',
        duration: initialData.duration || 1,
        phoneNumber: initialData.phoneNumber || '',
        notes: initialData.notes || '',
        paymentStatus: initialData.paymentStatus || initialData.paymentMethod === 'paid' ? 'paid' : 'pending'
      });
    }
  }, [editMode, initialData]);
  
  // Close on escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        handleClose();
      }
    };
    
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, loading]);
  
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const totalPrice = calculateTotalPrice();
  const courtNumbers = getCourtNumberOptions();
  
  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div 
        className="modal-content create-booking-modal" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '550px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-header">
          <h2>{editMode ? 'Edit Booking' : 'Create New Booking'}</h2>
          <button className="close-modal" onClick={handleClose} disabled={loading}>
            ✕
          </button>
        </div>
        
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {/* Error Message */}
            {error && (
              <div style={{
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                color: '#721c24',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '0.85rem'
              }}>
                <strong>❌ Error:</strong> {error}
              </div>
            )}
            
            {/* Success Message */}
            {success && (
              <div style={{
                backgroundColor: '#d4edda',
                border: '1px solid #c3e6cb',
                color: '#155724',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '0.85rem'
              }}>
                <strong>✅ Success:</strong> {success}
              </div>
            )}
            
            {/* Customer Information Section */}
            <div className="detail-section" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '12px', fontSize: '1rem', color: '#1a2b56' }}>
                Customer Information
              </h3>
              
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  placeholder="customer@example.com"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '0.9rem',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#0071e3'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
              </div>
              
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Leave blank to use email prefix"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
              
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="+201234567890"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '0.9rem'
                  }}
                />
                <small style={{ fontSize: '0.7rem', color: '#666', marginTop: '4px', display: 'block' }}>
                  Format: 8-15 digits, +, spaces, and hyphens allowed
                </small>
              </div>
            </div>
            
            {/* Booking Details Section */}
            <div className="detail-section" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '12px', fontSize: '1rem', color: '#1a2b56' }}>
                Booking Details
              </h3>
              
              <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Court Type *
                  </label>
                  <select
                    name="courtType"
                    value={formData.courtType}
                    onChange={handleCourtTypeChange}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '0.9rem',
                      backgroundColor: 'white'
                    }}
                  >
                    {courtTypeOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label} ({option.price} EGP/hour)
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Court Number *
                  </label>
                  <select
                    name="courtNumber"
                    value={formData.courtNumber}
                    onChange={handleChange}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '0.9rem',
                      backgroundColor: 'white'
                    }}
                  >
                    {courtNumbers.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    required
                    disabled={loading}
                    min={getMinDate()}
                    max={getMaxDate()}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
                
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Time Slot *
                  </label>
                  <select
                    name="timeSlot"
                    value={formData.timeSlot}
                    onChange={handleChange}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '0.9rem',
                      backgroundColor: 'white'
                    }}
                  >
                    {timeSlots.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Duration (hours) *
                  </label>
                  <select
                    name="duration"
                    value={formData.duration}
                    onChange={handleChange}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '0.9rem',
                      backgroundColor: 'white'
                    }}
                  >
                    {durationOptions.map(option => (
                      <option key={option} value={option}>
                        {option} hour{option > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Payment Status
                  </label>
                  <select
                    name="paymentStatus"
                    value={formData.paymentStatus}
                    onChange={handleChange}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '0.9rem',
                      backgroundColor: 'white'
                    }}
                  >
                    {paymentOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Any special requests or notes..."
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '0.9rem',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>
            
            {/* Price Summary */}
            <div style={{
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              padding: '12px 16px',
              marginTop: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '500' }}>Total Price:</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#28a745' }}>
                  {new Intl.NumberFormat('en-EG', {
                    style: 'currency',
                    currency: 'EGP',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                  }).format(totalPrice)}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '8px' }}>
                {formData.courtType === 'padel' ? '400 EGP/hour' : '150 EGP/hour'} × {formData.duration} hour{formData.duration > 1 ? 's' : ''}
              </div>
            </div>
            
            {/* Info Note */}
            <div style={{
              fontSize: '0.75rem',
              color: '#666',
              marginTop: '16px',
              padding: '10px',
              backgroundColor: '#e7f3ff',
              borderRadius: '8px',
              borderLeft: '3px solid #0071e3'
            }}>
              <span>ℹ️ </span>
              If the user doesn't exist, they will be automatically created with a random password.
              They can reset their password using the "Forgot Password" feature.
            </div>
          </div>
          
          <div className="modal-footer" style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            padding: '16px 20px',
            borderTop: '1px solid #eee',
            backgroundColor: 'white'
          }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                fontWeight: '500',
                transition: 'all 0.2s',
                opacity: loading ? 0.6 : 1
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: loading ? '#6c757d' : '#28a745',
                color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600',
                transition: 'all 0.2s',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Creating...' : (editMode ? 'Update Booking' : 'Create Booking')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookingForm;