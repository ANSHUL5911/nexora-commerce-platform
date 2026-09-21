import './RouteLoadingFallback.css';

export function RouteLoadingFallback({ message = 'Accessing archival record...' }) {
  return (
    <div className="nx-route-loader" aria-busy="true" aria-label={message}>
      <div className="nx-route-loader-bar">
        <div className="nx-route-loader-indeterminate" />
      </div>
      <span className="nx-route-loader-text">{message}</span>
    </div>
  );
}
