/**
 * Re-export useToast hook from ToastContext for convenience
 *
 * @example Basic usage
 * ```tsx
 * import { useToast } from '@/hooks/use-toast';
 *
 * function MyComponent() {
 *   const { showToast } = useToast();
 *
 *   const handleSuccess = () => {
 *     showToast({
 *       message: 'Operation completed successfully!',
 *       variant: 'success',
 *     });
 *   };
 *
 *   return <button onClick={handleSuccess}>Click Me</button>;
 * }
 * ```
 *
 * @example With action buttons
 * ```tsx
 * import { useToast } from '@/hooks/use-toast';
 *
 * function DeleteButton() {
 *   const { showToast } = useToast();
 *
 *   const handleDelete = async () => {
 *     await deleteItem();
 *     showToast({
 *       message: 'Item deleted successfully',
 *       variant: 'success',
 *       actions: [
 *         {
 *           label: 'Undo',
 *           onClick: () => {
 *             restoreItem();
 *             showToast({ message: 'Restored', variant: 'info' });
 *           },
 *         },
 *       ],
 *     });
 *   };
 *
 *   return <button onClick={handleDelete}>Delete</button>;
 * }
 * ```
 *
 * @example Custom duration
 * ```tsx
 * // Quick notification (2 seconds)
 * showToast({
 *   message: 'Settings saved',
 *   variant: 'success',
 *   duration: 2000,
 * });
 *
 * // Manual dismiss only
 * showToast({
 *   message: 'Review required',
 *   variant: 'warning',
 *   duration: null,
 * });
 * ```
 *
 * @example Error handling
 * ```tsx
 * try {
 *   await riskyOperation();
 *   showToast({ message: 'Success!', variant: 'success' });
 * } catch (error) {
 *   showToast({
 *     message: error.message || 'Something went wrong',
 *     variant: 'error',
 *     duration: 7000, // Longer for errors
 *   });
 * }
 * ```
 */
export {
  useToast,
  type ToastVariant,
  type ToastAction,
  type ToastOptions,
} from '@/contexts/toast';
