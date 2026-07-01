import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  buildCountParams,
  DEFAULT_OPTIONS,
  CountOptions,
} from '../src/renderer/components/PlayerCountModule.jsx';

const INPUT = {
  roots: ['/photos'],
  glob: '',
  preset: 'jpg',
  dateFrom: '',
  dateTo: '',
  recursive: true,
};

describe('buildCountParams', () => {
  it('includes the counting options', () => {
    const params = buildCountParams(
      INPUT,
      { gapMinutes: 45, baseline: 'mean', minImages: 5 },
      false,
      null
    );
    expect(params.gap_minutes).toBe(45);
    expect(params.baseline).toBe('mean');
    expect(params.min_images).toBe(5);
    expect(params.per_match).toBe(false);
  });

  it('falls back to the CLI-parity defaults when options are missing', () => {
    const params = buildCountParams(INPUT, undefined, true);
    expect(params.gap_minutes).toBe(DEFAULT_OPTIONS.gapMinutes);
    expect(params.baseline).toBe(DEFAULT_OPTIONS.baseline);
    expect(params.min_images).toBe(DEFAULT_OPTIONS.minImages);
    expect(params.per_match).toBe(true);
  });

  it('sends null exclusion lists when there is no override (keeps backend defaults)', () => {
    const params = buildCountParams(INPUT, DEFAULT_OPTIONS, false, null);
    expect(params.tranare).toBeNull();
    expect(params.publik).toBeNull();
  });

  it('sends the edited lists as an override when provided', () => {
    const params = buildCountParams(INPUT, DEFAULT_OPTIONS, false, {
      tranare: ['Coach'],
      publik: ['Uncle'],
    });
    expect(params.tranare).toEqual(['Coach']);
    expect(params.publik).toEqual(['Uncle']);
  });
});

describe('CountOptions', () => {
  const baseProps = {
    options: DEFAULT_OPTIONS,
    onOptionsChange: () => {},
    onOptionsPreview: () => {},
    exclusions: { tranare: [], publik: [] },
    alwaysMarkers: { publik: ['Klacken'], grupp: ['Laget', 'FBK'] },
    exclusionsDirty: false,
    savingDefaults: false,
    onAddExcluded: () => {},
    onRemoveExcluded: () => {},
    onSaveDefaults: () => {},
    onReset: () => {},
    busy: false,
  };

  it('renders the three counting controls', () => {
    render(<CountOptions {...baseProps} />);
    expect(screen.getByText(/Matchgap/)).toBeTruthy();
    expect(screen.getByText(/Baslinje/)).toBeTruthy();
    expect(screen.getByText(/Min bilder/)).toBeTruthy();
  });

  it('previews clamped numeric changes on input, commits on blur', () => {
    const onOptionsPreview = vi.fn();
    const onOptionsChange = vi.fn();
    render(
      <CountOptions
        {...baseProps}
        onOptionsPreview={onOptionsPreview}
        onOptionsChange={onOptionsChange}
      />
    );
    const gap = screen.getByTitle(/Minsta lucka mellan matcher/);
    // Typing previews the clamped value (min 1) without re-running the count...
    fireEvent.change(gap, { target: { value: '0' } });
    expect(onOptionsPreview).toHaveBeenCalledWith(expect.objectContaining({ gapMinutes: 1 }));
    expect(onOptionsChange).not.toHaveBeenCalled();
    // ...and blur commits (triggers the recount).
    fireEvent.blur(gap);
    expect(onOptionsChange).toHaveBeenCalled();
  });

  it('shows the exclusion editor with locked always-markers when expanded', () => {
    render(<CountOptions {...baseProps} />);
    fireEvent.click(screen.getByText(/Uteslutna/));
    expect(screen.getByText('Tränare')).toBeTruthy();
    expect(screen.getByText('Publik')).toBeTruthy();
    // The Gruppbilder row renders for the group always-markers.
    expect(screen.getByText('Gruppbilder')).toBeTruthy();
    // All always-markers (publik + grupp) are rendered as locked chips.
    const locked = screen.getAllByTitle('Alltid utesluten').map((el) => el.textContent);
    expect(locked).toEqual(expect.arrayContaining(['Klacken', 'Laget', 'FBK']));
  });

  it('disables "Spara som standard" until there are unsaved edits', () => {
    const { rerender } = render(<CountOptions {...baseProps} />);
    fireEvent.click(screen.getByText(/Uteslutna/));
    expect(screen.getByText('Spara som standard').disabled).toBe(true);
    rerender(<CountOptions {...baseProps} exclusionsDirty />);
    expect(screen.getByText('Spara som standard').disabled).toBe(false);
  });
});
