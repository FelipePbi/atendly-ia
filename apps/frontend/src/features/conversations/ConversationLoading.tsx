"use client";

/** Placeholder de carregamento da lista, fora da árvore acessível. */
export function ConversationLoading() {
  return (
    <div aria-hidden="true" className="conversation-loading-list">
      {[0, 1, 2, 3].map((item) => (
        <div className="conversation-loading-row" key={item}>
          <span className="skeleton conversation-loading-avatar" />
          <span className="conversation-loading-copy">
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line" />
          </span>
          <span className="skeleton skeleton-line" />
        </div>
      ))}
    </div>
  );
}
