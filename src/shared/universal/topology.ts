import type { TopologyConfig, TopologyDomain, TopologyLayer } from "./types";

export type DeriveDomainResult = {
  domain: string;
  source: "explicit" | "override" | "prefix" | "stage" | "default";
};

/**
 * Derive the domain for a surface ID using the topology config.
 *
 * Priority chain:
 * 1. `opts.explicitDomain` (item's own `domain` field)
 * 2. `topology.overrides[id]` (per-ID config)
 * 3. First matching `topology.prefixRules` entry
 * 4. `topology.stageMap[opts.stage]` (routes only)
 * 5. `topology.defaultDomain` (fallback)
 */
export function deriveDomain(
  id: string,
  topology: TopologyConfig,
  opts?: { explicitDomain?: string; stage?: string },
): DeriveDomainResult {
  if (opts?.explicitDomain) {
    return { domain: opts.explicitDomain, source: "explicit" };
  }

  const override = topology.overrides?.[id];
  if (override) {
    return { domain: override, source: "override" };
  }

  if (topology.prefixRules) {
    for (const rule of topology.prefixRules) {
      if (id.startsWith(rule.prefix)) {
        return { domain: rule.domain, source: "prefix" };
      }
    }
  }

  if (opts?.stage && topology.stageMap) {
    const stageDomain = topology.stageMap[opts.stage];
    if (stageDomain) {
      return { domain: stageDomain, source: "stage" };
    }
  }

  return { domain: topology.defaultDomain, source: "default" };
}

/**
 * Derive the domains associated with a storage target.
 * Falls back to `[topology.defaultDomain]` if not configured.
 */
export function deriveStorageDomains(
  id: string,
  topology: TopologyConfig,
): string[] {
  return topology.storageDomains?.[id] ?? [topology.defaultDomain];
}

/** Get all domains as an ordered array. */
export function getDomains(topology: TopologyConfig): TopologyDomain[] {
  return Object.values(topology.domains);
}

/** Get all domain IDs as an ordered array. */
export function getDomainIds(topology: TopologyConfig): string[] {
  return Object.keys(topology.domains);
}

/** Get all layers as an ordered array. */
export function getLayers(topology: TopologyConfig): TopologyLayer[] {
  return Object.values(topology.layers ?? {});
}

/** Find the layer that contains a given module ID. */
export function moduleToLayer(
  moduleId: string,
  topology: TopologyConfig,
): TopologyLayer | undefined {
  for (const layer of Object.values(topology.layers ?? {})) {
    if (layer.modules.includes(moduleId)) {
      return layer;
    }
  }
  return undefined;
}
