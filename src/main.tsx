import {createRoot} from 'react-dom/client';
import SharedProductHost from './SharedProductHost';
import {startFrontendDiagnostic} from './lib/frontendDiagnostic.mjs';
import './shared/window-frame.css';
import './shared/frame-theme.css';
import './styles/hex-native-surface.css';

createRoot(document.getElementById('root')!, startFrontendDiagnostic(window)).render(<SharedProductHost />);
