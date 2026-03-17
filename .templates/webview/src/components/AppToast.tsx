import { useEffect, useState } from "react";

export type ToastItem = {
  env: string;
  setting: string;
  masked: boolean;
};

export type ToastData = {
  title: string;
  items: ToastItem[];
};

type AppToastProps = {
  toast: ToastData | null;
  onDismiss: () => void;
};

const AUTO_DISMISS_MS = 6000;

export function AppToast({ toast, onDismiss }: AppToastProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setExiting(false);
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 200);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const dismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 200);
  };

  return (
    <div className={`app-toast${exiting ? " toast-exit" : ""}`}>
      <div className="app-toast-inner">
        <div className="app-toast-header">
          <span className="app-toast-title">{toast.title}</span>
          <button type="button" className="app-toast-dismiss" onClick={dismiss}>
            ×
          </button>
        </div>
        <div className="app-toast-items">
          {toast.items.map((item) => (
            <div key={item.env} className="app-toast-item">
              <span className="app-toast-item-env">{item.env}</span>
              <span className="app-toast-item-arrow">&rarr;</span>
              <span className={`app-toast-item-setting${item.masked ? " app-toast-item-masked" : ""}`}>
                {item.setting}{item.masked ? " (masked)" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
