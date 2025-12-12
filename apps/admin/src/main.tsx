import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { ConfigProvider } from '@/contexts/config';
import { AuthProvider } from '@/contexts/auth';
import { AccessTreeProvider } from '@/contexts/access-tree';
import { ToastProvider } from '@/contexts/toast';
import { DataUpdatesProvider } from '@/contexts/data-updates';
import { Router } from '@/router';
import { ToastContainer } from '@/components/organisms/ToastContainer';

// Initialize error logger (runs automatically)
import '@/lib/error-logger';

import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider>
          <DataUpdatesProvider>
            <AccessTreeProvider>
              <ToastProvider>
                <Router />
                <ToastContainer />
              </ToastProvider>
            </AccessTreeProvider>
          </DataUpdatesProvider>
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>
);
