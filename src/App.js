// src/App.js
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import ErrorBoundary from './components/common/ErrorBoundary';

const ManagerApp = lazy(() => import('./ManagerApp'));
const SimulatorApp = lazy(() => import('./SimulatorApp'));
const AuthPage = lazy(() => import('./components/auth/AuthPage'));

const LoadingFallback = ({ message = 'Loading...' }) => (
    <div className="w-full h-screen flex justify-center items-center bg-gray-900">
        <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-500"></div>
            <p className="text-white text-lg mt-4">{message}</p>
        </div>
    </div>
);

// This component checks auth state
function useAuth() {
    const [user, setUser] = React.useState(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    return { user, loading };
}

// This component protects routes that require a user to be logged in
const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <LoadingFallback message="Authenticating..." />;
    }

    if (!user) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to. This allows us to send them back after they log in.
        return <Navigate to="/auth" state={{ from: location }} replace />;
    }

    // Pass the user object to the children (ManagerApp)
    return React.cloneElement(children, { user });
};

// This component protects routes that should NOT be accessible when logged in
const PublicRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <LoadingFallback message="Authenticating..." />;
    }

    if (user) {
        return <Navigate to="/" replace />;
    }

    return children;
};


function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route 
                path="/" 
                element={
                    <ProtectedRoute>
                        <ManagerApp />
                    </ProtectedRoute>
                } 
            />
            <Route 
                path="/auth"
                element={
                    <PublicRoute>
                        <AuthPage />
                    </PublicRoute>
                }
            />
            <Route path="/simulator/*" element={<SimulatorApp />} />
          </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  );
}

export default App;