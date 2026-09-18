import { AuthProvider } from './context/AuthContext'
import Dashboard from './components/Dashboard'

function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  )
}

export default App
