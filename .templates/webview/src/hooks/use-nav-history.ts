import { useCallback, useRef, useState } from "react";

export function useNavHistory() {
  const stackRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const navigatingRef = useRef(false);

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const updateCanStates = useCallback(() => {
    setCanGoBack(indexRef.current > 0);
    setCanGoForward(indexRef.current < stackRef.current.length - 1);
  }, []);

  const push = useCallback(
    (path: string) => {
      if (navigatingRef.current) {
        return;
      }
      // Deduplicate: skip if same as current path
      if (indexRef.current >= 0 && stackRef.current[indexRef.current] === path) {
        return;
      }
      // Truncate forward entries
      stackRef.current = stackRef.current.slice(0, indexRef.current + 1);
      stackRef.current.push(path);
      indexRef.current = stackRef.current.length - 1;
      updateCanStates();
    },
    [updateCanStates],
  );

  const goBack = useCallback((): string | null => {
    if (indexRef.current <= 0) {
      return null;
    }
    navigatingRef.current = true;
    indexRef.current -= 1;
    updateCanStates();
    return stackRef.current[indexRef.current];
  }, [updateCanStates]);

  const goForward = useCallback((): string | null => {
    if (indexRef.current >= stackRef.current.length - 1) {
      return null;
    }
    navigatingRef.current = true;
    indexRef.current += 1;
    updateCanStates();
    return stackRef.current[indexRef.current];
  }, [updateCanStates]);

  const clearNavigating = useCallback(() => {
    navigatingRef.current = false;
  }, []);

  return { canGoBack, canGoForward, push, goBack, goForward, clearNavigating };
}
