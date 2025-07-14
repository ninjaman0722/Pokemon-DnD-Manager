import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center p-4">
                    <div className="bg-red-900 border border-red-600 text-white p-8 rounded-lg max-w-lg text-center shadow-2xl">
                        <h1 className="text-3xl font-bold mb-4">Application Error</h1>
                        <p className="text-left mb-4">A critical error occurred. Please try reloading the application.</p>
                        <pre className="text-left bg-gray-800 p-2 rounded text-xs overflow-auto mb-4">
                            {this.state.error?.toString()}
                        </pre>
                        <button onClick={() => this.setState({ hasError: false, error: null })} className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded">
                            Try to Recover
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;