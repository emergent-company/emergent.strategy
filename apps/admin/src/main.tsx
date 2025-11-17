import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { ConfigProvider } from '@/contexts/config';
import { AuthProvider } from '@/contexts/auth';
import { AccessTreeProvider } from '@/contexts/access-tree';
import { Router } from '@/router';

// Initialize error logger (runs automatically)
import '@/lib/error-logger';

import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider>
          <AccessTreeProvider>
            <Router />
          </AccessTreeProvider>
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>
);
