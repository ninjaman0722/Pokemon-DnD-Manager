import React from 'react';

// Mock the components that App.js is trying to import
export const BrowserRouter = ({ children }) => <div>{children}</div>;
export const Route = () => null;
export const Routes = ({ children }) => <div>{children}</div>;
export const Navigate = () => null;
export const useLocation = () => ({ pathname: '/' });