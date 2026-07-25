import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RehearsalsPage from './pages/RehearsalsPage';
import RehearsalDetailPage from './pages/RehearsalDetailPage';
import GigsPage from './pages/GigsPage';
import GigDetailPage from './pages/GigDetailPage';
import MusicPage from './pages/MusicPage';
import PRPage from './pages/PRPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute><DashboardPage /></ProtectedRoute>
          } />
          <Route path="/rehearsals" element={
            <ProtectedRoute><RehearsalsPage /></ProtectedRoute>
          } />
          <Route path="/rehearsals/:id" element={
            <ProtectedRoute><RehearsalDetailPage /></ProtectedRoute>
          } />
          <Route path="/gigs" element={
            <ProtectedRoute><GigsPage /></ProtectedRoute>
          } />
          <Route path="/gigs/:id" element={
            <ProtectedRoute><GigDetailPage /></ProtectedRoute>
          } />
          <Route path="/music" element={
            <ProtectedRoute><MusicPage /></ProtectedRoute>
          } />
          <Route path="/pr" element={
            <ProtectedRoute><PRPage /></ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
