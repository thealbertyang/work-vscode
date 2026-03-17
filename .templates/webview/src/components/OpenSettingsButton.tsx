import { useAppContext } from "../contexts/app-context";

type OpenSettingsButtonProps = {
  loading?: boolean;
};

export function OpenSettingsButton({ loading }: OpenSettingsButtonProps) {
  const { openSettings, isWebview } = useAppContext();

  return (
    <button className="secondary" onClick={openSettings} disabled={!isWebview || loading}>
      Open VS Code Settings
    </button>
  );
}
