import '@fontsource-variable/geist'
import '@fontsource-variable/inter'
import './assets/main.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import { TooltipProvider } from './components/ui/tooltip'
createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <App />
  </TooltipProvider>
)
