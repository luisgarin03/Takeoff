import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PlanNavigator from './src/components/PlanNavigator.jsx';
import { GoogleAuthProvider } from './src/lib/google/AuthContext.jsx';
import './src/styles/tokens.css';
import './src/styles/app.css';
const n = Number(new URLSearchParams(location.search).get('n') || 29);
const sheets = [{ name: 'Fixture.pdf' }];
const keys = Array.from({length:n}, (_, i) => i ? `Fixture.pdf#${i+1}` : 'Fixture.pdf');
const thumbs = {current:new Map(keys.map(key => [key, 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7']))};
const getDoc = async () => ({numPages:n});
function Fixture() {
  const [result, setResult] = useState(null);
  return <><PlanNavigator canClose onExit={() => {}} sheets={sheets} getDoc={getDoc}
    scales={{}} detectedScales={{}} shapes={[]} labels={{}} thumbCacheRef={thumbs}
    busyRef={{current:false}} openTabs={['Fixture.pdf']} onAddFiles={() => {}}
    onOpen={(selected, sideBySide) => setResult({selected,sideBySide})}/>
    <output style={{position:'fixed',bottom:0,left:0,zIndex:99999}}>{JSON.stringify(result)}</output></>;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><GoogleAuthProvider><Fixture/></GoogleAuthProvider></MemoryRouter>);
