import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import TradeShareCard from './components/TradeShareCard';

const trade = {
  id: '1234567890abcdef',
  symbol: 'ETH',
  direction: 'UP',
  status: 'WON',
  payout: 16.39,
  amount: 10,
  entryPrice: 3421.55,
  exitPrice: 3435.12,
  duration: 15,
  timestamp: Date.now(),
  tx: '0xabc1234567890abc1234567890abc1234567890',
};

createRoot(document.getElementById('root')).render(
  <div style={{ background: '#000', minHeight: '100vh' }}>
    <TradeShareCard
      isOpen={true}
      onClose={() => {}}
      trade={trade}
      userProfile={{ username: 'tester' }}
      theme="dark"
    />
  </div>
);
