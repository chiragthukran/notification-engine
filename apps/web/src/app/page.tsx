'use client';

import { useAppContext } from '../context/AppContext';
import { EngineMonitor } from '../components/EngineMonitor';

export default function EngineMonitorPage() {
  const { stats } = useAppContext();

  if (!stats) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <div className="loading-text">Loading engine statistics...</div>
      </div>
    );
  }

  return <EngineMonitor stats={stats} />;
}
