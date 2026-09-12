import { Routes, Route, Navigate } from 'react-router-dom';
import Landing    from './pages/Landing/Landing';
import EditorApp  from './pages/Editor/EditorApp';

/**
 * App — top-level router.
 *
 * /         → Landing page (animated card-fan intro)
 * /editor   → Full Veltrix editor (all existing features, unchanged)
 * *         → Redirect unknown paths to /
 */
export default function App() {
  return (
    <Routes>
      <Route path="/"       element={<Landing />} />
      <Route path="/editor" element={<EditorApp />} />
      <Route path="*"       element={<Navigate to="/" replace />} />
    </Routes>
  );
}
