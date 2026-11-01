import React, { useState } from 'react';
import Navbar from './components/Navbar.jsx';
import PracticeView from './components/PracticeView.jsx';
import DiagnosticDashboard from './components/DiagnosticDashboard.jsx';
import { getSampleDiagnostic } from './data/mockDiagnostic.js';

export default function App() {
  const [activeView, setActiveView] = useState('practice'); // 'practice' | 'diagnostic'
  const [targetBowAngle, setTargetBowAngle] = useState(45);
  const [diagnosticData, setDiagnosticData] = useState(() => getSampleDiagnostic(45));

  const handleLoadSampleData = () => {
    const sample = getSampleDiagnostic(targetBowAngle);
    setDiagnosticData(sample);
    setActiveView('diagnostic');
  };

  const handleSessionAnalyzed = (payload) => {
    setDiagnosticData(payload);
    setActiveView('diagnostic');
  };

  const handleChangeTargetBowAngle = (newAngle) => {
    setTargetBowAngle(newAngle);
    if (diagnosticData && diagnosticData.session_id === 'sample-shukatsu-001') {
      setDiagnosticData(getSampleDiagnostic(newAngle));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <Navbar
        activeView={activeView}
        onSelectView={setActiveView}
        targetBowAngle={targetBowAngle}
        onChangeTargetBowAngle={handleChangeTargetBowAngle}
        onLoadSampleData={handleLoadSampleData}
      />

      <main className="flex-1">
        {activeView === 'practice' ? (
          <PracticeView
            targetBowAngle={targetBowAngle}
            onSessionAnalyzed={handleSessionAnalyzed}
            onFallbackSample={handleLoadSampleData}
          />
        ) : (
          <DiagnosticDashboard
            diagnostic={diagnosticData}
            targetBowAngle={targetBowAngle}
            onBackToStudio={() => setActiveView('practice')}
          />
        )}
      </main>
    </div>
  );
}

