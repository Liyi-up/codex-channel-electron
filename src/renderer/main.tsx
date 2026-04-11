import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import App from './App';
import { queryClient } from './query/queryClient';
import './tailwind.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('找不到 #root 节点');
}

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
