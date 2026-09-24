import './styles/main.css';
import { initPresentation } from './app/presentation';
import { initPWA } from './app/pwa';
import { Shell } from './app/shell';
import { initTheme } from './app/theme';

initTheme();
initPresentation();
new Shell(document.getElementById('app')!).start();
initPWA();
