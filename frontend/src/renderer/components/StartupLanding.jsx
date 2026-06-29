/**
 * StartupLanding - Empty-workspace landing page.
 *
 * Shown by FlexLayoutWorkspace when the app starts with no queue/files. Presents
 * the workflow steps in order as buttons that open the matching module. The
 * Import step is enabled only while a camera card volume is mounted; the others
 * are always enabled (each module handles its own file selection / empty state).
 * The view is dismissed by the workspace once a module opens or an image loads.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { Icon } from './Icon.jsx';
import './StartupLanding.css';

// Poll interval for card detection so Import lights up when a card is inserted.
const VOLUME_POLL_MS = 4000;

// Workflow steps in order. `requiresCard` gates Import on a mounted card volume;
// the rest are always enabled. `moduleId` strings match MODULE_COMPONENTS.
const STEPS = [
  {
    moduleId: 'import',
    label: 'Importera',
    icon: 'folder-plus',
    requiresCard: true,
    disabledHint: 'Sätt i ett minneskort för att importera',
  },
  { moduleId: 'rename-nef', label: 'Byt namn', icon: 'file' },
  { moduleId: 'review-module', label: 'Granska ansikten', icon: 'user' },
  { moduleId: 'player-count', label: 'Räkna spelare', icon: 'layers' },
  { moduleId: 'culling', label: 'Gallra spelare', icon: 'check-circle' },
];

export function StartupLanding({ onOpenModule }) {
  const { api } = useBackend();
  const [cardPresent, setCardPresent] = useState(false);

  const checkVolumes = useCallback(async () => {
    try {
      const data = await api.get('/api/v1/import/volumes');
      setCardPresent((data.volumes || []).length > 0);
    } catch {
      // Backend may not be ready yet; treat as no card and retry on next poll.
      setCardPresent(false);
    }
  }, [api]);

  useEffect(() => {
    checkVolumes();
    const id = setInterval(checkVolumes, VOLUME_POLL_MS);
    return () => clearInterval(id);
  }, [checkVolumes]);

  return (
    <div className="startup-landing" role="region" aria-label="Kom igång">
      <div className="startup-landing-card">
        <h1 className="startup-landing-title">Kom igång</h1>
        <p className="startup-landing-subtitle">Välj ett steg i arbetsflödet.</p>
        <div className="startup-landing-steps">
          {STEPS.map((step) => {
            const disabled = step.requiresCard && !cardPresent;
            return (
              <button
                key={step.moduleId}
                type="button"
                className="btn-action startup-landing-step"
                disabled={disabled}
                title={disabled ? step.disabledHint : undefined}
                onClick={() => onOpenModule(step.moduleId)}
              >
                <Icon name={step.icon} size={20} />
                <span>{step.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
