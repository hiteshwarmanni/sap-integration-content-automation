// client/src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import {
  ShellBar,
  SideNavigation,
  SideNavigationItem,
  Title,
  FlexBox,
  FlexBoxDirection,
  FlexBoxJustifyContent,
  Label,
  Input,
  Button,
  UploadCollection
} from '@ui5/webcomponents-react';

// This is the correct way to import Fiori assets in Vite
import '@ui5/webcomponents-fiori/dist/Assets.js';

// --- 1. Define Your Pages ---

function HomePage() {
  return (
    <div style={{ padding: '2rem' }}>
      <Title level="H2">Welcome to the SAP Automation Tool</Title>
    </div>
  );
}

function DownloadPage() {
  return (
    <FlexBox
      direction={FlexBoxDirection.Column}
      justifyContent={FlexBoxJustifyContent.Start}
      style={{ padding: '2rem', maxWidth: '400px', gap: '1rem' }}
    >
      <Title level="H3">Download Configuration</Title>
      
      <div><Label required>Project Name</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>Environment</Label><Input style={{ width: '100%' }} /></div>
      <div><Label>User Name</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>CPI Base URL</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>Token URL</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>Client ID</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>Client Secret</Label><Input type="Password" style={{ width: '100%' }} /></div>
      
      <Button design="Emphasized" style={{ marginTop: '1rem' }}>Download Config</Button>
    </FlexBox>
  );
}

function UploadPage() {
  return (
    <FlexBox
      direction={FlexBoxDirection.Column}
      justifyContent={FlexBoxJustifyContent.Start}
      style={{ padding: '2rem', maxWidth: '400px', gap: '1rem' }}
    >
      <Title level="H3">Upload Configuration</Title>
      
      <div><Label required>Project Name</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>Environment</Label><Input style={{ width: '100%' }} /></div>
      <div><Label>User Name</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>CPI Base URL</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>Token URL</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>Client ID</Label><Input style={{ width: '100%' }} /></div>
      <div><Label required>Client Secret</Label><Input type="Password" style={{ width: '100%' }} /></div>
      
      <UploadCollection style={{ marginTop: '1rem' }}>
        <div slot="noDataDescription">Drag and drop your CSV file here</div>
      </UploadCollection>
      
      <Button design="Emphasized" style={{ marginTop: '1rem' }}>Upload Config</Button>
    </FlexBox>
  );
}

// --- 2. Build the Main App Shell ---

function App() {
  const [sideNavOpen, setSideNavOpen] = useState(true);

  return (
    <BrowserRouter>
      <ShellBar
        primaryTitle="SAP Integration Suite Automation"
        showCoPilot
        onNavButtonPress={() => setSideNavOpen(!sideNavOpen)}
      />
      <div style={{ display: 'flex', height: 'calc(100vh - 3rem)' }}>
        <SideNavigation
          style={{ height: '100%', display: sideNavOpen ? '' : 'none' }}
        >
          <SideNavigationItem as={Link} to="/" text="Home" icon="home" />
          <SideNavigationItem as={Link} to="/download" text="Download Config" icon="download" />
          <SideNavigationItem as={Link} to="/upload" text="Upload Config" icon="upload" />
        </SideNavigation>
        
        <main style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
          {/* This is where your pages will appear */}
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/download" element={<DownloadPage />} />
            <Route path="/upload" element={<UploadPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;