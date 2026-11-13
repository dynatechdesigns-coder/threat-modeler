// Turns an RTK Query error (from .unwrap() or the `error` field of a hook) into a readable message.
export function getErrorMessage(err) {
  if (!err) return '';
  if (err.data?.message) return err.data.message;
  if (err.status === 'FETCH_ERROR') {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'You are offline. Reconnect to the internet and try again.'
      : 'Cannot reach the server. Check your connection and try again.';
  }
  if (err.status === 'PARSING_ERROR') return 'Unexpected response from the server';
  if (err.error) return err.error;
  return err.message || 'Something went wrong';
}
