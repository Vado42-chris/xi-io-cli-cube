import {createRoot} from 'react-dom/client';
import SharedProductHost from './SharedProductHost';
import './shared/window-frame.css';
import './shared/frame-theme.css';

createRoot(document.getElementById('root')!).render(<SharedProductHost />);
