import React from 'react';
// --- AWS AMPLIFY ---
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

import CustomAuthWrapper from './components/Auth';

// ==========================================
// CONFIGURACIÓN DE AWS COGNITO
// ==========================================
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID || 'eu-north-1_F7AiUXQ5n',
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || '3031dnoutcfcrvi4g0gs18pbu6',
    }
  }
});

// ==========================================
// PUNTO DE ENTRADA DE LA APP
// ==========================================
const App = () => (
  <Authenticator.Provider>
    <CustomAuthWrapper />
  </Authenticator.Provider>
);

export default App;
