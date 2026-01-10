/**
 * useFormState - Reusable form state management
 *
 * Consolidates the pattern of:
 * - Form state with initial values
 * - Reset to initial state
 * - Field update helpers
 *
 * Used by: DatabaseManagement (6+ forms), and other form-heavy components
 */

import { useState, useCallback, useMemo } from 'react';

/**
 * Hook for managing form state with reset capability
 *
 * @param {object} initialState - Initial form values
 * @returns {object} Form state and helpers
 *
 * @example
 * const { values, setValue, setValues, reset, isDirty } = useFormState({
 *   name: '',
 *   email: ''
 * });
 *
 * // Update single field
 * setValue('name', 'John');
 *
 * // Update multiple fields
 * setValues({ name: 'John', email: 'john@example.com' });
 *
 * // Reset to initial state
 * reset();
 */
export function useFormState(initialState) {
  const [values, setValuesInternal] = useState(initialState);

  /**
   * Update a single field
   */
  const setValue = useCallback((field, value) => {
    setValuesInternal(prev => ({ ...prev, [field]: value }));
  }, []);

  /**
   * Update multiple fields at once
   */
  const setValues = useCallback((updates) => {
    setValuesInternal(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Reset form to initial state
   */
  const reset = useCallback(() => {
    setValuesInternal(initialState);
  }, [initialState]);

  /**
   * Check if form has been modified from initial state
   */
  const isDirty = useMemo(() => {
    return JSON.stringify(values) !== JSON.stringify(initialState);
  }, [values, initialState]);

  /**
   * Get value for a specific field
   */
  const getValue = useCallback((field) => values[field], [values]);

  /**
   * Create onChange handler for input elements
   * @param {string} field - Field name to update
   * @returns {function} onChange handler
   */
  const getInputProps = useCallback((field) => ({
    value: values[field] ?? '',
    onChange: (e) => setValue(field, e.target.value)
  }), [values, setValue]);

  /**
   * Create onChange handler for select elements
   */
  const getSelectProps = useCallback((field) => ({
    value: values[field] ?? '',
    onChange: (e) => setValue(field, e.target.value)
  }), [values, setValue]);

  /**
   * Create onChange handler for checkbox elements
   */
  const getCheckboxProps = useCallback((field) => ({
    checked: !!values[field],
    onChange: (e) => setValue(field, e.target.checked)
  }), [values, setValue]);

  return {
    values,
    setValue,
    setValues,
    reset,
    isDirty,
    getValue,
    getInputProps,
    getSelectProps,
    getCheckboxProps,
    // Direct setter for advanced use cases
    setValuesInternal
  };
}

/**
 * Hook for managing multiple related forms
 *
 * @param {object} formsConfig - Object mapping form names to initial states
 * @returns {object} Forms state and helpers
 *
 * @example
 * const forms = useMultipleForms({
 *   rename: { oldName: '', newName: '' },
 *   delete: { name: '' }
 * });
 *
 * // Access specific form
 * forms.rename.values.oldName
 * forms.rename.setValue('oldName', 'John')
 * forms.rename.reset()
 *
 * // Reset all forms
 * forms.resetAll()
 */
export function useMultipleForms(formsConfig) {
  const formNames = Object.keys(formsConfig);

  // Create individual form hooks for each form
  const formStates = {};
  for (const name of formNames) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    formStates[name] = useFormState(formsConfig[name]);
  }

  /**
   * Reset all forms to their initial states
   */
  const resetAll = useCallback(() => {
    for (const name of formNames) {
      formStates[name].reset();
    }
  }, [formNames, formStates]);

  /**
   * Check if any form has been modified
   */
  const anyDirty = useMemo(() => {
    return formNames.some(name => formStates[name].isDirty);
  }, [formNames, formStates]);

  return {
    ...formStates,
    resetAll,
    anyDirty
  };
}

export default useFormState;
