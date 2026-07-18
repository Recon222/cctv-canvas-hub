import ReactDOM from 'react-dom/client'
import { QuickPaneApp } from './features/quick-pane'
import './quick-pane.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

ReactDOM.createRoot(rootElement).render(<QuickPaneApp />)
