import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the backend context so we control the /import/volumes response.
const mockGet = vi.fn();
vi.mock('../src/renderer/context/BackendContext.jsx', () => ({
  useBackend: () => ({ api: { get: mockGet } }),
}));

import { StartupLanding } from '../src/renderer/components/StartupLanding.jsx';

describe('StartupLanding', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('renders all five workflow steps in order', async () => {
    mockGet.mockResolvedValue({ volumes: [] });
    render(<StartupLanding onOpenModule={() => {}} />);

    const buttons = await screen.findAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Importera',
      'Byt namn',
      'Granska ansikten',
      'Räkna spelare',
      'Gallra spelare',
    ]);
  });

  it('disables Import when no card volume is present', async () => {
    mockGet.mockResolvedValue({ volumes: [] });
    render(<StartupLanding onOpenModule={() => {}} />);

    const importBtn = screen.getByRole('button', { name: /Importera/ });
    await waitFor(() => expect(importBtn.disabled).toBe(true));
  });

  it('enables Import when a card volume is present', async () => {
    mockGet.mockResolvedValue({ volumes: [{ mount: '/Volumes/EOS_DIGITAL' }] });
    render(<StartupLanding onOpenModule={() => {}} />);

    const importBtn = screen.getByRole('button', { name: /Importera/ });
    await waitFor(() => expect(importBtn.disabled).toBe(false));
  });

  it('calls onOpenModule with the step id when a step is clicked', async () => {
    mockGet.mockResolvedValue({ volumes: [] });
    const onOpenModule = vi.fn();
    render(<StartupLanding onOpenModule={onOpenModule} />);

    fireEvent.click(screen.getByRole('button', { name: /Granska ansikten/ }));
    expect(onOpenModule).toHaveBeenCalledWith('review-module');
  });

  it('does not let a disabled Import button fire onOpenModule', async () => {
    mockGet.mockResolvedValue({ volumes: [] });
    const onOpenModule = vi.fn();
    render(<StartupLanding onOpenModule={onOpenModule} />);

    const importBtn = screen.getByRole('button', { name: /Importera/ });
    await waitFor(() => expect(importBtn.disabled).toBe(true));
    fireEvent.click(importBtn);
    expect(onOpenModule).not.toHaveBeenCalled();
  });
});
