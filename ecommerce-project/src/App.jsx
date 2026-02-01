import { Routes, Route } from 'react-router';
import './App.css';
import { HomePage } from './pages/HomePage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrdersPage } from './pages/OrdersPage';

function App() {

  return (
    <Routes>
      <Route path='/' element={<HomePage />} />
      <Route path='checkout' element={<CheckoutPage />} />
      <Route path="orders" element={<OrdersPage />}/>
    </Routes>

  )
}

export default App
