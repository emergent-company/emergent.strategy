import React, { forwardRef } from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Icon } from '@/components/atoms/Icon';

export interface FormFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Field label text */
  label?: string;
  /** Secondary label text (shown on right side) */
  labelAlt?: string;
  /** Helper text displayed below the input */
  description?: string;
  /** Secondary helper text (shown on right side below input) */
  descriptionAlt?: string;
  /** Error message displayed below the input */
  error?: string;
  /** Success message displayed below the input */
  success?: string;
  /** Warning message displayed below the input */
  warning?: string;
  /** Mark field as required with asterisk */
  required?: boolean;
  /** Icon to display on the left side of the input */
  leftIcon?: string;
  /** Icon to display on the right side of the input */
  rightIcon?: string;
  /** Container className for the form-control wrapper */
  containerClassName?: string;
  /** Input size variant */
  inputSize?: 'xs' | 'sm' | 'md' | 'lg';
  /** Input color variant */
  inputColor?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error';
  /** Show bordered style */
  bordered?: boolean;
  /** Show ghost style */
  ghost?: boolean;
}

/**
 * FormField Molecule
 *
 * A reusable form field component that follows DaisyUI patterns.
 * Provides consistent styling for labels, inputs, descriptions, and validation states.
 * Follows the react-daisyui pattern with form-control wrapper and label elements.
 *
 * @example
 * ```tsx
 * <FormField
 *   label="Email Address"
 *   type="email"
 *   placeholder="Enter your email"
 *   description="We'll never share your email"
 *   required
 * />
 * ```
 */
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      label,
      labelAlt,
      description,
      descriptionAlt,
      error,
      success,
      warning,
      required,
      leftIcon,
      rightIcon,
      containerClassName,
      inputSize,
      inputColor,
      bordered = true,
      ghost = false,
      disabled,
      readOnly,
      className,
      ...inputProps
    },
    ref
  ) => {
    // Determine validation state
    const hasError = !!error;
    const hasSuccess = !!success;
    const hasWarning = !!warning;

    // Build input classes using react-daisyui pattern
    const inputClasses = twMerge(
      'input',
      'w-full',
      className,
      clsx({
        'input-bordered': bordered,
        'input-ghost': ghost,
        'input-xs': inputSize === 'xs',
        'input-sm': inputSize === 'sm',
        'input-md': inputSize === 'md',
        'input-lg': inputSize === 'lg',
        'input-primary': inputColor === 'primary',
        'input-secondary': inputColor === 'secondary',
        'input-accent': inputColor === 'accent',
        'input-info': inputColor === 'info',
        'input-success':
          inputColor === 'success' || (hasSuccess && !inputColor),
        'input-warning':
          inputColor === 'warning' || (hasWarning && !inputColor),
        'input-error': inputColor === 'error' || (hasError && !inputColor),
        'bg-base-200/50 cursor-not-allowed': disabled || readOnly,
      })
    );

    // Helper text content and styling
    const primaryHelper = error || success || warning || description;
    const secondaryHelper = descriptionAlt;

    const primaryHelperClass = clsx(
      'label-text-alt',
      hasError && 'text-error',
      hasSuccess && 'text-success',
      hasWarning && 'text-warning',
      !hasError && !hasSuccess && !hasWarning && 'text-base-content/60'
    );

    return (
      <div className={twMerge('form-control', containerClassName)}>
        {/* Top label row - follows DaisyUI pattern */}
        {(label || labelAlt) && (
          <label className="label">
            {label && (
              <span className="label-text font-medium">
                {label}
                {required && <span className="text-error ml-1">*</span>}
              </span>
            )}
            {labelAlt && <span className="label-text-alt">{labelAlt}</span>}
          </label>
        )}

        {/* Input with optional icons */}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/60 pointer-events-none">
              <Icon icon={leftIcon} className="size-4" />
            </div>
          )}

          <input
            ref={ref}
            className={inputClasses}
            style={{
              paddingLeft: leftIcon ? '2.5rem' : undefined,
              paddingRight: rightIcon ? '2.5rem' : undefined,
            }}
            disabled={disabled}
            readOnly={readOnly}
            aria-invalid={hasError}
            aria-describedby={
              primaryHelper ? `${inputProps.id}-helper` : undefined
            }
            {...inputProps}
          />

          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/60 pointer-events-none">
              <Icon icon={rightIcon} className="size-4" />
            </div>
          )}
        </div>

        {/* Bottom helper text row - follows DaisyUI pattern */}
        {(primaryHelper || secondaryHelper) && (
          <label className="label">
            {primaryHelper && (
              <span
                id={inputProps.id ? `${inputProps.id}-helper` : undefined}
                className={primaryHelperClass}
              >
                {primaryHelper}
              </span>
            )}
            {secondaryHelper && (
              <span className="label-text-alt text-base-content/60">
                {secondaryHelper}
              </span>
            )}
          </label>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

export default FormField;
