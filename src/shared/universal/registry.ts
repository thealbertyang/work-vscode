import type {
  TopologyConfig,
  UniversalAction,
  UniversalCommand,
  UniversalConfig,
  UniversalDataset,
  UniversalEvent,
  UniversalNamespace,
  UniversalRoute,
  UniversalStorageConfig,
  UniversalView,
  UrlStateConfig,
} from "./types";
import { DEFAULT_UNIVERSAL_CONFIG } from "./defaults";
import { mergeUniversalConfig } from "./merge";

export type UniversalRegistry = {
  config: UniversalConfig;
  namespaces: Record<string, UniversalNamespace>;
  actions: Record<string, UniversalAction>;
  commands: Record<string, UniversalCommand>;
  events: Record<string, UniversalEvent>;
  routes: Record<string, UniversalRoute>;
  views: Record<string, UniversalView>;
  datasets: Record<string, UniversalDataset>;
  storage?: UniversalStorageConfig;
  urlState?: UrlStateConfig;
  topology?: TopologyConfig;
};

export const createUniversalRegistry = (
  override?: Partial<UniversalConfig>,
): UniversalRegistry => {
  const config = mergeUniversalConfig(DEFAULT_UNIVERSAL_CONFIG, override);
  return {
    config,
    namespaces: config.namespaces,
    actions: config.actions ?? {},
    commands: config.commands ?? {},
    events: config.events ?? {},
    routes: config.routes ?? {},
    views: config.views ?? {},
    datasets: config.datasets ?? {},
    storage: config.storage,
    urlState: config.urlState,
    topology: config.topology,
  };
};
