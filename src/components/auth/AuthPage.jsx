import React, { useState, useCallback, useEffect } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { useNavigate } from 'react-router-dom';
import { FaSpinner } from 'react-icons/fa';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  // Redirect authenticated users
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate('/');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please use a different email or log in.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return 'An error occurred. Please try again.';
    }
  };

  const validateForm = () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return false;
    }
    if (!isLogin && (!displayName || displayName.length < 2)) {
      setError('Display name must be at least 2 characters long.');
      return false;
    }
    return true;
  };

  const sanitizeDisplayName = (name) => {
    // Remove HTML tags and trim; limit to alphanumeric, spaces, and basic punctuation
    return name.replace(/<[^>]+>/g, '').replace(/[^\w\s.-]/g, '').trim().slice(0, 50);
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!validateForm()) {
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        navigate('/');
      } else {
        const sanitizedName = sanitizeDisplayName(displayName);
        if (!sanitizedName) {
          setError('Invalid display name.');
          setLoading(false);
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: sanitizedName });
        await setDoc(doc(db, 'users', user.uid), {
          email: user.email,
          displayName: sanitizedName,
        });
        navigate('/');
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  }, [email, password, displayName, isLogin]);

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Please enter your email address to reset your password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setError('Password reset email sent. Check your inbox.');
    } catch (err) {
      setError(getFriendlyErrorMessage(err.code));
    }
  };

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-gray-800 p-6 sm:p-8 rounded-lg shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-indigo-400 mb-6 text-center">{isLogin ? 'Login' : 'Sign Up'}</h1>
        {error && <p className="bg-red-500/20 text-red-400 p-3 rounded-md mb-4 text-center">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-6" aria-label={isLogin ? 'Login form' : 'Sign up form'}>
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="displayName">Display Name</label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-gray-900 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="Ash Ketchum"
                aria-required="true"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-900 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="ash@ketchum.com"
              aria-required="true"
            />
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="password">Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="••••••••"
              aria-required="true"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-10 text-gray-400 hover:text-gray-200 text-sm"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-md transition-colors flex items-center justify-center ${loading ? 'cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <>
                <FaSpinner className="animate-spin mr-2" />
                Processing...
              </>
            ) : isLogin ? 'Login' : 'Create Account'}
          </button>
        </form>
        <div className="text-center mt-6 space-y-2">
          <p>
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-indigo-400 hover:underline"
              aria-label={isLogin ? 'Switch to sign up' : 'Switch to login'}
            >
              {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'}
            </button>
          </p>
          {isLogin && (
            <p>
              <button
                type="button"
                onClick={handlePasswordReset}
                className="text-indigo-400 hover:underline"
                aria-label="Reset password"
              >
                Forgot Password?
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;